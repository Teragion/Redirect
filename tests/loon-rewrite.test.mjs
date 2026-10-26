import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ArgumentsBuilder } from "@iringo/arguments-builder";
import Handlebars from "handlebars";
import { argsFull } from "../arguments-builder.full.config.ts";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
Handlebars.registerHelper("@package", key => pkg[key]);
Handlebars.registerHelper("version", () => pkg.version);
Handlebars.registerHelper("now", () => "2026-10-27 00:00:00");
Handlebars.registerHelper("inline", value => new Handlebars.SafeString(value.replaceAll("\n", "\\n")));
const builder = new ArgumentsBuilder({ args: argsFull });
const { argumentsText, scriptParams } = builder.buildLoonArguments();
const settings = Object.fromEntries(argsFull.filter(arg => !arg.exclude?.includes("loon")).map(arg => [arg.key, arg.defaultValue]));

/**
 * 按官方文档模拟此模板使用的 URL 匹配及变量展开子集，不替代 Loon 真机测试。
 * Model the documented URL-match and expansion subset, not the Loon runtime itself.
 * @param {string} plugin 生成插件 / Rendered plugin.
 * @param {string} url 原始 URL / Original URL.
 * @param {object} args 参数值 / Argument values.
 * @returns {string} 重写 URL / Rewritten URL.
 */
function rewrite(plugin, url, args = settings) {
	for (const line of plugin.split("\n").filter(line => line.startsWith("request if"))) {
		const parsed = line.match(/^request if \$\{url\} ~= \/(.+)\/ as (\w+) then url\.replace\("([^"]+)"\)$/);
		assert.ok(parsed, line);
		const [, pattern, name, replacement] = parsed;
		url = url.replace(new RegExp(pattern), (...match) => replacement.replace(/\$\{([^}]+)\}/g, (_, key) => {
			if (key.startsWith(`${name}.`)) return match[Number(key.slice(name.length + 1))];
			assert.ok(Object.hasOwn(args, key), `Undeclared argument: ${key}`);
			return args[key];
		}));
	}
	return url;
}

for (const channel of ["", ".dev"]) {
	const template = await readFile(new URL(`../template/loon${channel}.handlebars`, import.meta.url), "utf8");
	const rendered = Handlebars.compile(template)({ arguments: argumentsText, scriptParams });
	const plugin = process.env.LOON_PLUGIN_DIR ? await readFile(`${process.env.LOON_PLUGIN_DIR}/BiliBili.Redirect${channel}.plugin`, "utf8") : rendered;
	assert.equal(plugin.replace(/^#!date = .*$/m, ""), rendered.replace(/^#!date = .*$/m, ""));
	const scriptMatchers = plugin.split("\n").filter(line => line.startsWith("http-request ")).map(line => new RegExp(line.split(" ")[1]));
	test(`Loon${channel}: declared arguments expand without legacy placeholders`, () => {
		assert.doesNotMatch(plugin, /\{\{\{|\[URL Rewrite\]|\sheader\s*$/m);
		assert.match(plugin, /^HostOverseaVideo = select,"upos-sz-mirrorcos\.bilivideo\.com"/m);
		assert.match(plugin, /^HostBStar = select,/m);
		assert.doesNotMatch(plugin, /^Host\.(?:OverseaVideo|BStar) =/m);
		assert.match(scriptParams, /\{Host\.PCDN\}/);
		assert.match(scriptParams, /\{Host\.MCDN\}/);
		assert.equal(rewrite(plugin, "https://upos-sz-mirrorcosov.bilivideo.com/upgcxcode/v.m4s"), "https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/v.m4s");
		assert.doesNotMatch(plugin, /(?:Biliverse\/Redirect\/releases|gist\.githubusercontent\.com)/);
		assert.ok(plugin.includes(`https://github.com/Teragion/Redirect/releases/download/v${pkg.version}/request${channel}.bundle.js`));
	});
	test(`Loon${channel}: all direct CDN types preserve scheme, raw path and query`, () => {
		const hosts = [
			["upos-sz-mirrorcosov.bilivideo.com", "HostOverseaVideo"],
			["upos-sz-mirrorawsov.bilivideo.com", "HostOverseaVideo"],
			["upos-sz-mirrornew-1ov.bilivideo.com", "HostOverseaVideo"],
			["cn-hk-eq-01-14.bilivideo.com", "HostOverseaVideo"],
			["upos-hz-mirrorakam.akamaized.net", "HostOverseaVideo"],
			["upos-sz-mirrorakam.akamaized.net", "HostOverseaVideo"],
			["upos-sz-mirrorcosbstar1.bilivideo.com", "HostBStar"],
			["upos-sz-mirrornew-1bstar1.bilivideo.com", "HostBStar"],
			["upos-bstar1-mirrorakam.akamaized.net", "HostBStar"],
		];
		for (const [host, key] of hosts) {
			for (const scheme of ["http", "https"]) {
				for (const port of ["", ":80", ":443", ":4483"]) {
					const suffix = "/upgcxcode/01/%2f/a.m4s?sign=%2f%2F&x=1&x=2&empty=&plus=a+b&encoded=%26%3D#part";
					const url = `${scheme}://${host}${port}${suffix}`;
					const expected = `${scheme}://${settings[key]}${suffix}`;
					assert.equal(rewrite(plugin, url), expected);
					assert.ok(scriptMatchers.every(regex => !regex.test(url) && !regex.test(expected)));
				}
			}
		}
	});
	test(`Loon${channel}: BStar overseas target is not rewritten by OverseaVideo`, () => {
		for (const target of argsFull.find(arg => arg.key === "HostBStar").options.map(option => option.key)) {
			const result = rewrite(plugin, "https://upos-bstar1-mirrorakam.akamaized.net/upgcxcode/v.m4s?a=1", { ...settings, HostBStar: target });
			assert.equal(result, `https://${target}/upgcxcode/v.m4s?a=1`);
			assert.ok(scriptMatchers.every(regex => !regex.test(result)));
		}
		for (const target of argsFull.find(arg => arg.key === "HostOverseaVideo").options.map(option => option.key)) {
			assert.equal(rewrite(plugin, "http://upos-sz-mirrorcosov.bilivideo.com/upgcxcode/v", { ...settings, HostOverseaVideo: target }), `http://${target}/upgcxcode/v`);
		}
	});
	test(`Loon${channel}: PCDN/MCDN dispatch stays separate from native rewrite`, () => {
		for (const url of [
			"http://peer.example:4480/upgcxcode/v.m4s?xy_usource=upos-sz-mirrorcos.bilivideo.com",
			"https://abcd123.mcdn.bilivideo.cn:4483/upgcxcode/v.m4s",
			"http://abcd123.mcdn.bilivideo.cn:9102/upgcxcode/v.m4s",
			"http://abcd123.mcdn.bilivideo.cn:8000/v1/resource/v.m4s",
			"https://abcd123.mcdn.bilivideo.cn:8082/v1/resource/v.m4s",
		]) {
			assert.equal(rewrite(plugin, url), url);
			assert.equal(scriptMatchers.filter(regex => regex.test(url)).length, 1);
		}
		assert.equal(scriptMatchers.length, 3);
	});
	test(`Loon${channel}: unrelated and deceptive URLs are untouched`, () => {
		for (const url of [
			"https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/v.m4s",
			"https://upos-sz-mirrorcosov.bilivideo.com.evil.example/upgcxcode/v.m4s",
			"https://upos-sz-mirrorcosov.bilivideo.com@evil.example/upgcxcode/v.m4s",
			"https://example.com/upgcxcode/?next=https://upos-sz-mirrorcosov.bilivideo.com/upgcxcode/",
			"https://upos-sz-mirrorcosov.bilivideo.com/other/v.m4s",
			"https://upos-sz-mirrorcosov.bilivideo.com:9999/upgcxcode/v.m4s",
		]) assert.equal(rewrite(plugin, url), url);
	});
}

test("other clients and BoxJS retain dotted settings without Loon aliases", () => {
	const surge = builder.buildSurgeArguments();
	assert.match(surge.argumentsText, /Host\.OverseaVideo:/);
	assert.doesNotMatch(surge.argumentsText, /HostOverseaVideo|HostBStar/);
	const boxjs = builder.buildBoxJsSettings("@Biliverse.Redirect.Settings");
	assert.ok(boxjs.some(item => item.id.endsWith(".Host.OverseaVideo")));
	assert.ok(boxjs.every(item => !/\.(HostOverseaVideo|HostBStar)$/.test(item.id)));
});
