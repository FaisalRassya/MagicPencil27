// inject.js <pid> <dllPath> — LoadLibraryW via CreateRemoteThread
const koffi = require('koffi');
const k32 = koffi.load('kernel32.dll');
const OpenProcess = k32.func('void* __stdcall OpenProcess(uint32, int, uint32)');
const CloseHandle = k32.func('int __stdcall CloseHandle(void*)');
const VirtualAllocEx = k32.func('uint64 __stdcall VirtualAllocEx(void*, uint64, size_t, uint32, uint32)');
const VirtualFreeEx = k32.func('int __stdcall VirtualFreeEx(void*, uint64, size_t, uint32)');
const WPM = k32.func('int __stdcall WriteProcessMemory(void*, uint64, const uint8_t*, size_t, _Out_ size_t*)');
const GetModuleHandleW = k32.func('uint64 __stdcall GetModuleHandleW(str16)');
const GetProcAddress = k32.func('uint64 __stdcall GetProcAddress(uint64, str)');
const CreateRemoteThread = k32.func('void* __stdcall CreateRemoteThread(void*, void*, size_t, uint64, uint64, uint32, _Out_ uint32*)');
const WaitForSingleObject = k32.func('uint32 __stdcall WaitForSingleObject(void*, uint32)');
const GetExitCodeThread = k32.func('int __stdcall GetExitCodeThread(void*, _Out_ uint32*)');
const GetLastError = k32.func('uint32 __stdcall GetLastError()');
function inject(pid, dll) {
  const h = OpenProcess(0x0002 | 0x0008 | 0x0010 | 0x0020 | 0x0400, 0, pid);
  if (!h) throw new Error('OpenProcess failed ' + GetLastError());
  const buf = Buffer.from(dll + '\0', 'utf16le');
  const mem = VirtualAllocEx(h, 0n, buf.length, 0x3000, 0x04);
  if (!mem) throw new Error('VirtualAllocEx failed ' + GetLastError());
  if (!WPM(h, mem, buf, buf.length, [0])) throw new Error('WPM failed ' + GetLastError());
  const ll = GetProcAddress(GetModuleHandleW('kernel32.dll'), 'LoadLibraryW');
  const tid = [0];
  const th = CreateRemoteThread(h, null, 0, ll, mem, 0, tid);
  if (!th) throw new Error('CreateRemoteThread failed ' + GetLastError());
  WaitForSingleObject(th, 15000);
  const code = [0]; GetExitCodeThread(th, code);
  CloseHandle(th); VirtualFreeEx(h, mem, 0, 0x8000); CloseHandle(h);
  return code[0]; // low 32 bits of HMODULE (0 = failed)
}
module.exports = { inject };
if (require.main === module) {
  const r = inject(+process.argv[2], process.argv[3]);
  console.log('LoadLibraryW returned 0x' + r.toString(16), r ? 'OK' : 'FAILED');
}
