// fake game_plugin.dll + host for testing fmhook
#include <windows.h>
#include <stdio.h>
#include <stdint.h>
typedef struct { void *a, *b; } ObjectRef;
typedef struct { uint8_t *data; size_t count; } CppArray;
typedef struct { uint64_t key, additionalKey; int32_t mode; } ChannelAction;
#ifdef FAKE_DLL
#define X __declspec(dllexport)
X void game_plugin__fm__gameplugin__i_game_plugin_send_event(ObjectRef *i, uint32_t id, CppArray *to, CppArray *d) { printf("REAL send_event id=%u to=%zu data=%zu first=%02x\n", id, to->count, d->count, d->count ? d->data[0] : 0); fflush(stdout); }
X void game_plugin__fm__gameplugin__i_game_plugin_open_channels(ObjectRef *i, CppArray *a, CppArray *b) {}
X void game_plugin__fm__gameplugin__i_game_plugin_perform_channel_actions(ObjectRef *i, CppArray *a) {}
X void game_plugin__fm__gameplugin__i_game_plugin_update_channel_data(ObjectRef *i, ChannelAction *a, CppArray *d) { volatile int x = 0; x++; }
X void game_plugin__fm__gameplugin__i_game_plugin_tick(ObjectRef *i) { volatile int x = 0; x++; }
#else
int main(void) {
  HMODULE ga = LoadLibraryA("GameAssembly.dll"); void (*mse)(void*,unsigned,void*,void*) = (void*)GetProcAddress(ga,"ManagedSendEvent"); HMODULE m = LoadLibraryA("game_plugin.dll");
  void (*tick)(ObjectRef *) = (void *)GetProcAddress(m, "game_plugin__fm__gameplugin__i_game_plugin_tick");
  void (*se)(ObjectRef *, uint32_t, CppArray *, CppArray *) = (void *)GetProcAddress(m, "game_plugin__fm__gameplugin__i_game_plugin_send_event");
  void (*up)(ObjectRef *, ChannelAction *, CppArray *) = (void *)GetProcAddress(m, "game_plugin__fm__gameplugin__i_game_plugin_update_channel_data");
  ObjectRef inst = { (void *)0x1234, (void *)0x5678 };
  printf("host pid %lu\n", GetCurrentProcessId()); fflush(stdout);
  for (int i = 0; i < 1500; i++) {
    tick(&inst);
    if (i % 200 == 0) { uint8_t t[3] = { 1, 2, 3 }, d[2] = { 0xAB, 0xCD }; CppArray A = { t, 3 }, B = { d, 2 }; se(&inst, 42, &A, &B); ChannelAction ca = { 7, 8, 4 }; up(&inst, &ca, &B); void *sp[2]={0,0}; mse(0, 77, sp, 0); }
    Sleep(10);
  }
  return 0;
}
#endif
