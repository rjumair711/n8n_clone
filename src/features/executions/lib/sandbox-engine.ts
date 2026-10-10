import {
  RELEASE_SYNC,
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten";
import { SANDBOX_MEMORY_LIMIT_MB } from "./sandbox-limits";

// QuickJS's own memory limit (runtime.setMemoryLimit) does not add up what
// a script allocates in this WebAssembly build: it only refuses a single
// allocation larger than the limit, so a script could take hundreds of MB
// in 1 MB pieces. The limit that holds is the size of the WebAssembly
// memory itself, so each engine gets a memory of its own with a maximum.

const PAGE_BYTES = 64 * 1024;
const MB = 1024 * 1024;

// What the engine itself starts with (its code's data and stack). A script
// can use what is left of it on top of its own allowance.
const ENGINE_BASE_MB = 16;

// "Full" when an allocation fails: the memory grows in steps, so the last
// one may stop a little short of the maximum
const FULL_MARGIN_BYTES = 4 * MB;

export type SandboxEngine = {
  quickjs: QuickJSWASMModule;
  // Whether the engine's memory has grown to its maximum. QuickJS can be so
  // short of memory that it cannot even build the "out of memory" error and
  // reports nothing at all; this tells that case from `throw null`.
  isMemoryFull: () => boolean;
};

/**
 * A QuickJS engine that cannot hold more than SANDBOX_MEMORY_LIMIT_MB of
 * script data, whatever the script does. Dropping the engine gives all of
 * its memory back, including what a runtime that could not be disposed of
 * left behind.
 */
export const newSandboxEngine = async (): Promise<SandboxEngine> => {
  const maximumBytes = (ENGINE_BASE_MB + SANDBOX_MEMORY_LIMIT_MB) * MB;

  const wasmMemory = new WebAssembly.Memory({
    initial: (ENGINE_BASE_MB * MB) / PAGE_BYTES,
    maximum: maximumBytes / PAGE_BYTES,
  });

  const quickjs = await newQuickJSWASMModuleFromVariant(
    newVariant(RELEASE_SYNC, { wasmMemory })
  );

  return {
    quickjs,
    isMemoryFull: () =>
      wasmMemory.buffer.byteLength >= maximumBytes - FULL_MARGIN_BYTES,
  };
};
