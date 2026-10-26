import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const bundle = process.env.REDIRECT_BUNDLE ? await readFile(process.env.REDIRECT_BUNDLE, "utf8") : undefined;

/**
 * 在隔离的 Loon API 测试环境中执行待发布的真实脚本，不模拟 CDN 业务代码。
 * Execute the actual release script in isolated Loon API fixtures, without mocking CDN logic.
 * @param {string} url 请求地址 / Request URL.
 * @param {object} args 插件参数 / Plugin arguments.
 * @returns {Promise<object>} 完成的请求 / Completed request.
 */
async function request(url, args = {}) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("Bundle did not call $done")), 2000);
		try {
			vm.runInNewContext(bundle, {
				$loon: {},
				$script: { startTime: Date.now() / 1000 },
				$argument: { Storage: "Argument", LogLevel: "OFF", "Host.PCDN": "upos-sz-mirrorcos.bilivideo.com", "Host.MCDN": "proxy-tf-all-ws.bilivideo.com", ...args },
				$persistentStore: { read: () => null, write: () => true },
				$request: { method: "GET", url, headers: { Host: new URL(url).hostname, Range: "bytes=0-1023" } },
				$done: value => { clearTimeout(timer); resolve(value); },
				console: { log() {}, error() {}, warn() {} },
			}, { timeout: 1000 });
		} catch (error) {
			clearTimeout(timer);
			reject(error);
		}
	});
}

test("release bundle: PCDN selects xy_usource or the configured fallback", { skip: !bundle && "Set REDIRECT_BUNDLE to the release script asset" }, async () => {
	for (const [query, host] of [["?sign=abc", "upos-sz-mirrorcos.bilivideo.com"], ["?xy_usource=upos-sz-mirrorhw.bilivideo.com&sign=abc", "upos-sz-mirrorhw.bilivideo.com"]]) {
		const result = await request(`http://peer.example:4480/upgcxcode/v.m4s${query}`);
		assert.equal(result.url, `http://${host}/upgcxcode/v.m4s${query}`);
		assert.equal(result.headers.Host, host);
		assert.equal(result.headers.Range, "bytes=0-1023");
	}
});

test("release bundle: MCDN wraps the complete original URL and honors originalUrl", { skip: !bundle && "Set REDIRECT_BUNDLE to the release script asset" }, async () => {
	for (const [scheme, port] of [["https", "4483"], ["http", "9102"]]) {
		const original = `${scheme}://abcd123.mcdn.bilivideo.cn:${port}/upgcxcode/v.m4s?sign=a%2Fb&x=1&x=2`;
		const result = new URL((await request(original)).url);
		assert.equal(result.hostname, "proxy-tf-all-ws.bilivideo.com");
		assert.equal(result.searchParams.get("url"), original);
		const bypass = `${scheme}://abcd123.mcdn.bilivideo.cn:${port}/upgcxcode/v.m4s?originalUrl=1`;
		assert.equal((await request(bypass)).url, bypass);
	}
});

test("release bundle: MCDN v1/resource passes through unchanged", { skip: !bundle && "Set REDIRECT_BUNDLE to the release script asset" }, async () => {
	for (const [scheme, port] of [["http", "8000"], ["https", "8082"]]) {
		const url = `${scheme}://abcd123.mcdn.bilivideo.cn:${port}/v1/resource/v.m4s?sign=abc`;
		assert.equal((await request(url)).url, url);
	}
});
