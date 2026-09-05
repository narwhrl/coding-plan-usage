import { describe, expect, it } from "vitest";
import { installBrowserExtensionErrorFilter, isBrowserExtensionError } from "./browser-extension-error";

const IMMERSIVE_TRANSLATE_STACK = [
  "TypeError: Cannot read properties of undefined (reading 'search')",
  "    at <unknown> (chrome-extension://iikmkjmpaadaobahmlepeloendndfphd/userscript.html:2080:46)",
  "    at Array.forEach (<anonymous>)",
  "    at MutationObserver.<anonymous> (chrome-extension://iikmkjmpaadaobahmlepeloendndfphd/userscript.html:2066:19)",
].join("\n");

describe("isBrowserExtensionError", () => {
  it("matches the Immersive Translate overlay stack", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'search')");
    error.stack = IMMERSIVE_TRANSLATE_STACK;
    expect(
      isBrowserExtensionError({
        filename: "chrome-extension://iikmkjmpaadaobahmlepeloendndfphd/userscript.html",
        error,
      }),
    ).toBe(true);
  });

  it("matches filename-only extension errors", () => {
    expect(
      isBrowserExtensionError({
        filename: "moz-extension://abcd/content.js",
        message: "boom",
      }),
    ).toBe(true);
  });

  it("does not match the same TypeError from app code", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'search')");
    error.stack = [
      "TypeError: Cannot read properties of undefined (reading 'search')",
      "    at createHrefFromUrl (http://localhost:3000/_next/static/chunks/app.js:12:34)",
    ].join("\n");
    expect(
      isBrowserExtensionError({
        filename: "/src/app/(panel)/page.tsx",
        error,
      }),
    ).toBe(false);
  });
});

describe("installBrowserExtensionErrorFilter", () => {
  class TestErrorEvent extends Event {
    filename: string;
    error: unknown;
    constructor(filename: string, error: unknown) {
      super("error", { cancelable: true });
      this.filename = filename;
      this.error = error;
    }
  }

  it("stops extension errors before a later bubble listener", () => {
    const target = new EventTarget();
    let bubbled = false;
    installBrowserExtensionErrorFilter(target);
    target.addEventListener("error", () => {
      bubbled = true;
    });

    const error = new TypeError("Cannot read properties of undefined (reading 'search')");
    error.stack = IMMERSIVE_TRANSLATE_STACK;
    const event = new TestErrorEvent(
      "chrome-extension://iikmkjmpaadaobahmlepeloendndfphd/userscript.html",
      error,
    );
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
  });

  it("lets application errors reach later listeners", () => {
    const target = new EventTarget();
    let bubbled = false;
    installBrowserExtensionErrorFilter(target);
    target.addEventListener("error", () => {
      bubbled = true;
    });

    const error = new TypeError("Cannot read properties of undefined (reading 'search')");
    error.stack = "TypeError: Cannot read properties of undefined (reading 'search')\n    at page.tsx:10:2";
    const event = new TestErrorEvent("/src/app/(panel)/page.tsx", error);
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(bubbled).toBe(true);
  });
});
