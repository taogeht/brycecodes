import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import vm from "node:vm";

// Run the shipped inline client, with controllable HTTP and a small DOM seam.
// These tests cover navigation while requests are pending, not SRS rendering.
function client() {
  const elements = new Map<string, any>();
  function element(selector: string) {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: "", textContent: "", dataset: {}, style: {}, disabled: false,
      hidden: false, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, setAttribute() {}, removeAttribute() {},
      querySelectorAll() { return []; }, querySelector() { return null; },
      appendChild() {},
    });
    return elements.get(selector);
  }
  const requests: any[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let timerId = 0;
  const context = vm.createContext({
    console, AbortController,
    document: {
      body: element("body"), querySelector: element,
      querySelectorAll: () => [], addEventListener() {},
      createElement: () => element("created"),
    },
    window: { location: { pathname: "/alphabet-help/" } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, length: 0 },
    setTimeout(fn: () => void, ms: number) {
      timers.set(++timerId, { fn, ms }); return timerId;
    },
    clearTimeout(id: number) { timers.delete(id); },
    fetch(url: string, init: any) {
      return new Promise((resolve, reject) => {
        const request = { url, init, resolve: (body: any) => resolve({
          ok: true, status: 200, json: async () => body,
        }), reject };
        requests.push(request);
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  });
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  // init is waiting for its first fetch. Leave it pending; isolate navigation.
  requests.length = 0;
  vm.runInContext("renderAll = () => {}; viewClassId = 'class-a';", context);
  return { context, requests, timers, element,
    run: (code: string) => vm.runInContext(code, context) };
}

describe("student loading", () => {
  test("shows loading and disables answers until the student arrives", async () => {
    const c = client();
    const opening = c.run("openStudent('one')");
    expect(c.element("#stage").innerHTML).toContain("Loading student");
    expect(c.element("#btn-yes").disabled).toBe(true);
    c.requests[0].resolve({ id: "one", settings: { mode: "alphabet" }, session: { streak: 0 } });
    await opening;
    expect(c.run("student.id")).toBe("one");
    expect(c.element("#btn-yes").disabled).toBe(false);
  });

  test("a stalled request ends with a retry instead of a blank screen", async () => {
    const c = client();
    const opening = c.run("openStudent('one')");
    const timeout = [...c.timers.values()].find(t => t.ms === 15000);
    expect(timeout).toBeDefined();
    timeout!.fn();
    await opening;
    expect(c.element("#stage").innerHTML).toContain("Try again");
    expect(c.element("#stage").innerHTML).toContain("load");
    expect(c.element("#btn-yes").disabled).toBe(true);
  });

  test("a late response cannot replace a newer student", async () => {
    const c = client();
    const first = c.run("openStudent('one')");
    const second = c.run("openStudent('two')");
    c.requests[1].resolve({ id: "two", settings: { mode: "alphabet" }, session: { streak: 0 } });
    await second;
    c.requests[0].resolve({ id: "one", settings: { mode: "alphabet" }, session: { streak: 0 } });
    await first;
    expect(c.run("student.id")).toBe("two");
  });

  test("leaving practice cancels the load without reopening the student", async () => {
    const c = client();
    const opening = c.run("openStudent('one')");
    c.run("setView('home')");
    expect(c.requests[0].init.signal?.aborted).toBe(true);
    c.requests[0].resolve({ id: "one", settings: { mode: "alphabet" }, session: { streak: 0 } });
    await opening;
    expect(c.run("student")).toBeNull();
    expect(c.run("view")).toBe("home");
  });
});

test("class background loads are bounded and cancelled when practice opens", async () => {
  const c = client();
  c.run("view = 'class'");
  const background = c.run("renderNeedsList(Array.from({length: 22}, (_, i) => ({id: String(i)})), 'class-a')");
  expect(c.requests.length).toBeLessThanOrEqual(2);
  const backgroundRequests = [...c.requests];
  const opening = c.run("openStudent('selected')");
  for (const request of backgroundRequests) expect(request.init.signal?.aborted).toBe(true);
  c.requests.at(-1).resolve({ id: "selected", settings: { mode: "alphabet" }, session: { streak: 0 } });
  await opening;
  await background;
  expect(c.requests.length).toBe(backgroundRequests.length + 1);
});
