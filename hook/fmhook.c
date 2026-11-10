// fmhook.c — FM27 interop hook (Game Pass / Steam). Injected into fm.exe.
// Logs the UI -> game_plugin interop calls (send_event, open_channels, perform_channel_actions,
// update_channel_data) and replays commands on the game's main thread from inside tick().
// Command file: <dir>\cmd.txt  (one command per line, executed then renamed to cmd.done)
//   send <eventId> <hexObjTo> <hexData>
//   log on|off            (toggle logging of update_channel_data)
//   ping
#include <windows.h>
#include <stdio.h>
#include <stdint.h>
#include "MinHook.h"

typedef struct { void *nativeObject; void *managedObjectId; } ObjectRef;
typedef struct { uint8_t *data; size_t count; } CppArray;
typedef struct { uint64_t key, additionalKey; int32_t mode; } ChannelAction;

typedef void (*send_event_t)(ObjectRef *, uint32_t, CppArray *, CppArray *);
typedef void (*open_channels_t)(ObjectRef *, CppArray *, CppArray *);
typedef void (*perform_actions_t)(ObjectRef *, CppArray *);
typedef void (*update_data_t)(ObjectRef *, ChannelAction *, CppArray *);
typedef void (*tick_t)(ObjectRef *);

static send_event_t o_send_event; static open_channels_t o_open_channels;
static perform_actions_t o_perform; static update_data_t o_update; static tick_t o_tick;
static send_event_t p_send_event;
typedef struct { uint8_t *ptr; int32_t len; } Span;
typedef void (*m_send_event_t)(void *self, uint32_t id, Span *bytes, void *mi);
typedef void (*m_send_resp_t)(void *self, Span *keys, Span *items, void *mi);
typedef void (*m_send_resp3_t)(void *self, Span *keys, Span *sizes, Span *items, void *mi); // FM 0.9.2435+
static m_send_resp3_t o_m_send_resp3; static int g_resp3;
static m_send_event_t o_m_send_event; static m_send_resp_t o_m_send_resp;
static char g_respGrep[256]; static int g_respAll; static int g_hooked;
static void *g_targets[16]; static int g_ntargets;
static ObjectRef g_inst; static int g_haveInst;
static char g_dir[MAX_PATH];
static FILE *g_log; static CRITICAL_SECTION g_cs;
static int g_logUpdates = 0; static volatile LONG g_tickCount;

static void logf_(const char *fmt, ...) {
  EnterCriticalSection(&g_cs);
  if (g_log) {
    SYSTEMTIME st; GetLocalTime(&st);
    fprintf(g_log, "%02d:%02d:%02d.%03d ", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
    va_list ap; va_start(ap, fmt); vfprintf(g_log, fmt, ap); va_end(ap);
    fputc('\n', g_log); fflush(g_log);
  }
  LeaveCriticalSection(&g_cs);
}
static void hex(char *out, const uint8_t *p, size_t n, size_t max) {
  static const char *h = "0123456789abcdef"; size_t i, m = n < max ? n : max;
  for (i = 0; i < m; i++) { out[i * 2] = h[p[i] >> 4]; out[i * 2 + 1] = h[p[i] & 15]; }
  out[m * 2] = 0; if (n > max) strcat(out, "...");
}
static char g_hb1[70000], g_hb2[70000];

static void h_send_event(ObjectRef *inst, uint32_t id, CppArray *to, CppArray *data) {
  if (inst) { g_inst = *inst; g_haveInst = 1; }
  EnterCriticalSection(&g_cs);
  hex(g_hb1, to ? to->data : 0, to ? to->count : 0, 4096);
  hex(g_hb2, data ? data->data : 0, data ? data->count : 0, 32000);
  LeaveCriticalSection(&g_cs);
  logf_("EVENT id=%u to[%zu]=%s data[%zu]=%s", id, to ? to->count : 0, g_hb1, data ? data->count : 0, g_hb2);
  o_send_event(inst, id, to, data);
}
static void h_open_channels(ObjectRef *inst, CppArray *req, CppArray *ch) {
  if (inst) { g_inst = *inst; g_haveInst = 1; }
  if (g_logUpdates) {
    EnterCriticalSection(&g_cs);
    hex(g_hb1, req ? req->data : 0, req ? req->count : 0, 4096);
    hex(g_hb2, ch ? ch->data : 0, ch ? ch->count * 16 : 0, 16000);
    LeaveCriticalSection(&g_cs);
    logf_("OPEN req[%zu]=%s ch[%zu]=%s", req ? req->count : 0, g_hb1, ch ? ch->count : 0, g_hb2);
  }
  o_open_channels(inst, req, ch);
}
static void h_perform(ObjectRef *inst, CppArray *keys) {
  if (inst) { g_inst = *inst; g_haveInst = 1; }
  if (g_logUpdates && keys && keys->count) {
    EnterCriticalSection(&g_cs);
    hex(g_hb1, keys->data, keys->count * 24, 16000);
    LeaveCriticalSection(&g_cs);
    logf_("ACTIONS n=%zu %s", keys->count, g_hb1);
  }
  o_perform(inst, keys);
}
static void h_update(ObjectRef *inst, ChannelAction *a, CppArray *data) {
  if (inst) { g_inst = *inst; g_haveInst = 1; }
  if (g_logUpdates) {
    EnterCriticalSection(&g_cs);
    hex(g_hb2, data ? data->data : 0, data ? data->count : 0, 8000);
    LeaveCriticalSection(&g_cs);
    logf_("UPDATE key=%llx add=%llx mode=%d data[%zu]=%s", a ? a->key : 0, a ? a->additionalKey : 0, a ? a->mode : -1, data ? data->count : 0, g_hb2);
  }
  o_update(inst, a, data);
}

static int unhex(const char *s, uint8_t *out, size_t max) {
  size_t n = 0;
  while (s[0] && s[1] && n < max) {
    int hi = s[0] <= '9' ? s[0] - '0' : (s[0] | 32) - 'a' + 10, lo = s[1] <= '9' ? s[1] - '0' : (s[1] | 32) - 'a' + 10;
    if (hi < 0 || hi > 15 || lo < 0 || lo > 15) break;
    out[n++] = (uint8_t)(hi * 16 + lo); s += 2;
  }
  return (int)n;
}
static uint8_t g_b1[65536], g_b2[262144];
static char g_line[700000];
static void run_commands(ObjectRef *inst) {
  char path[MAX_PATH], done[MAX_PATH];
  snprintf(path, MAX_PATH, "%s\\cmd.txt", g_dir); snprintf(done, MAX_PATH, "%s\\cmd.done", g_dir);
  if (GetFileAttributesA(path) == INVALID_FILE_ATTRIBUTES) return;
  FILE *f = fopen(path, "rb"); if (!f) return;
  int n = 0;
  while (fgets(g_line, sizeof g_line, f)) {
    char *p = g_line; size_t L = strlen(p); while (L && (p[L - 1] == '\n' || p[L - 1] == '\r')) p[--L] = 0;
    if (!L) continue;
    if (!strncmp(p, "send ", 5)) {
      char *a = p + 5; uint32_t id = (uint32_t)strtoul(a, &a, 10); while (*a == ' ') a++;
      char *b = strchr(a, ' '); if (!b) { logf_("CMD bad send"); continue; } *b++ = 0;
      if (!strcmp(a, "-")) a = ""; if (!strcmp(b, "-")) b = "";
      CppArray A = { g_b1, (size_t)unhex(a, g_b1, sizeof g_b1) }, B = { g_b2, (size_t)unhex(b, g_b2, sizeof g_b2) };
      logf_("CMD send id=%u to=%zu data=%zu", id, A.count, B.count);
      p_send_event(inst, id, &A, &B); n++;
    } else if (!strcmp(p, "log on")) { g_logUpdates = 1; logf_("CMD log on"); }
    else if (!strcmp(p, "log off")) { g_logUpdates = 0; logf_("CMD log off"); }
    else if (!strncmp(p, "resp grep ", 10)) { strncpy(g_respGrep, p + 10, 255); g_respAll = 0; logf_("CMD resp grep '%s'", g_respGrep); }
    else if (!strcmp(p, "resp all")) { g_respAll = 1; logf_("CMD resp all"); }
    else if (!strcmp(p, "resp off")) { g_respGrep[0] = 0; g_respAll = 0; logf_("CMD resp off"); }
    else if (!strcmp(p, "unhook")) { for (int k = 0; k < g_ntargets; k++) MH_DisableHook(g_targets[k]); g_hooked = 0; logf_("CMD unhooked (tick hook disabled too; reinject to use again)"); }
    else if (!strcmp(p, "ping")) { logf_("CMD pong ticks=%ld inst=%p", g_tickCount, inst->nativeObject); }
    else logf_("CMD unknown: %.80s", p);
  }
  fclose(f);
  DeleteFileA(done); MoveFileA(path, done);
  logf_("CMD batch done (%d sends)", n);
}
static int contains(const uint8_t *p, size_t n, const char *needle) {
  size_t m = strlen(needle); if (!m || n < m) return 0;
  for (size_t i = 0; i + m <= n; i++) if (p[i] == (uint8_t)needle[0] && !memcmp(p + i, needle, m)) return 1;
  return 0;
}
static void h_m_send_event(void *self, uint32_t id, Span *b, void *mi) {
  EnterCriticalSection(&g_cs); hex(g_hb2, b ? b->ptr : 0, b ? (size_t)b->len : 0, 16000); LeaveCriticalSection(&g_cs);
  logf_("NEVENT id=%u data[%d]=%s", id, b ? b->len : 0, g_hb2);
  o_m_send_event(self, id, b, mi);
}
static void h_m_send_resp(void *self, Span *keys, Span *items, void *mi) {
  if (items && items->ptr && items->len > 0 && (g_respAll || (g_respGrep[0] && contains(items->ptr, (size_t)items->len, g_respGrep)))) {
    EnterCriticalSection(&g_cs);
    hex(g_hb1, keys ? keys->ptr : 0, keys ? (size_t)keys->len * 8 : 0, 4000);
    hex(g_hb2, items->ptr, (size_t)items->len, 34000);
    LeaveCriticalSection(&g_cs);
    logf_("RESP keys[%d]=%s items[%d]=%s", keys ? keys->len : 0, g_hb1, items->len, g_hb2);
  }
  o_m_send_resp(self, keys, items, mi);
}
static void h_m_send_resp3(void *self, Span *keys, Span *sizes, Span *items, void *mi) {
  if (items && items->ptr && items->len > 0 && (g_respAll || (g_respGrep[0] && contains(items->ptr, (size_t)items->len, g_respGrep)))) {
    EnterCriticalSection(&g_cs);
    hex(g_hb1, sizes ? sizes->ptr : 0, sizes ? (size_t)sizes->len * 4 : 0, 4000);
    logf_("RESPSZ sizes[%d]=%s", sizes ? sizes->len : 0, g_hb1);
    hex(g_hb1, keys ? keys->ptr : 0, keys ? (size_t)keys->len * 8 : 0, 4000);
    { /* 0.9.2435+: items start with a u32 item count; strip it so the log matches the old format */
      const uint8_t *ip = items->ptr; int il = items->len;
      if (il >= 4 && keys && *(const uint32_t *)ip == (uint32_t)keys->len) { ip += 4; il -= 4; }
      hex(g_hb2, ip, (size_t)il, 34000);
      LeaveCriticalSection(&g_cs);
      logf_("RESP keys[%d]=%s items[%d]=%s", keys ? keys->len : 0, g_hb1, il, g_hb2);
    }
  }
  o_m_send_resp3(self, keys, sizes, items, mi);
}
static void h_tick(ObjectRef *inst) {
  if (inst) { g_inst = *inst; g_haveInst = 1; }
  o_tick(inst);
  if ((InterlockedIncrement(&g_tickCount) % 15) == 0) {
    run_commands(inst);
  }
}

// Resolve a managed method at runtime through GameAssembly's IL2CPP API (works for every build/storefront).
typedef void *(*il2_domain_get_t)(void); typedef void **(*il2_domain_get_assemblies_t)(void *, size_t *);
typedef void *(*il2_assembly_get_image_t)(void *); typedef void *(*il2_class_from_name_t)(void *, const char *, const char *);
typedef void *(*il2_method_from_name_t)(void *, const char *, int); typedef void *(*il2_thread_attach_t)(void *);
typedef unsigned (*il2_param_count_t)(void *); typedef void *(*il2_get_param_t)(void *, unsigned); typedef char *(*il2_type_name_t)(void *);
static void *g_last_mi;
static void describe_method(HMODULE ga, void *mi, const char *what) {
  il2_param_count_t pc = (il2_param_count_t)GetProcAddress(ga, "il2cpp_method_get_param_count");
  il2_get_param_t gp = (il2_get_param_t)GetProcAddress(ga, "il2cpp_method_get_param");
  il2_type_name_t tn = (il2_type_name_t)GetProcAddress(ga, "il2cpp_type_get_name");
  if (!mi || !pc) return;
  unsigned n = pc(mi); char buf[512]; int o = snprintf(buf, sizeof buf, "%s params=%u:", what, n);
  for (unsigned i = 0; i < n && gp && tn && o < 480; i++) { char *t = tn(gp(mi, i)); o += snprintf(buf + o, sizeof buf - o, " %s", t ? t : "?"); }
  logf_("%s", buf);
}
static unsigned param_count(HMODULE ga, void *mi) { il2_param_count_t pc = (il2_param_count_t)GetProcAddress(ga, "il2cpp_method_get_param_count"); return (mi && pc) ? pc(mi) : 0; }
static void *resolve_managed(HMODULE ga, const char *ns, const char *cls, const char *meth, int argc) {
  il2_domain_get_t dget = (il2_domain_get_t)GetProcAddress(ga, "il2cpp_domain_get");
  il2_domain_get_assemblies_t dasm = (il2_domain_get_assemblies_t)GetProcAddress(ga, "il2cpp_domain_get_assemblies");
  il2_assembly_get_image_t aimg = (il2_assembly_get_image_t)GetProcAddress(ga, "il2cpp_assembly_get_image");
  il2_class_from_name_t cfn = (il2_class_from_name_t)GetProcAddress(ga, "il2cpp_class_from_name");
  il2_method_from_name_t mfn = (il2_method_from_name_t)GetProcAddress(ga, "il2cpp_class_get_method_from_name");
  il2_thread_attach_t tat = (il2_thread_attach_t)GetProcAddress(ga, "il2cpp_thread_attach");
  if (!dget || !dasm || !aimg || !cfn || !mfn) return 0;
  void *dom = dget(); if (!dom) return 0;
  if (tat) tat(dom);
  size_t n = 0; void **as = dasm(dom, &n);
  for (size_t i = 0; as && i < n; i++) {
    void *img = aimg(as[i]); if (!img) continue;
    void *k = cfn(img, ns, cls); if (!k) continue;
    void *mi = mfn(k, meth, argc); if (!mi) continue;
    g_last_mi = mi;
    return *(void **)mi; // MethodInfo->methodPointer
  }
  return 0;
}
#define EXP(n) "game_plugin__fm__gameplugin__i_game_plugin_" n
static DWORD WINAPI init_thread(LPVOID self) {
  HMODULE gp = 0; int i;
  for (i = 0; i < 600 && !(gp = GetModuleHandleA("game_plugin.dll")); i++) Sleep(100);
  if (!gp) { logf_("game_plugin.dll not found"); return 0; }
  void *f_send = GetProcAddress(gp, EXP("send_event")), *f_open = GetProcAddress(gp, EXP("open_channels")),
       *f_perf = GetProcAddress(gp, EXP("perform_channel_actions")), *f_upd = GetProcAddress(gp, EXP("update_channel_data")),
       *f_tick = GetProcAddress(gp, EXP("tick"));
  logf_("exports send=%p open=%p perform=%p update=%p tick=%p", f_send, f_open, f_perf, f_upd, f_tick);
  if (!f_send || !f_open || !f_perf || !f_upd || !f_tick) return 0;
  p_send_event = (send_event_t)f_send;
  if (MH_Initialize() != MH_OK) { logf_("MH_Initialize failed"); return 0; }
  int r1 = MH_CreateHook(f_send, h_send_event, (void **)&o_send_event);
  int r2 = MH_CreateHook(f_open, h_open_channels, (void **)&o_open_channels);
  int r3 = MH_CreateHook(f_perf, h_perform, (void **)&o_perform);
  int r4 = MH_CreateHook(f_upd, h_update, (void **)&o_update);
  int r5 = MH_CreateHook(f_tick, h_tick, (void **)&o_tick);
  p_send_event = o_send_event;
  g_targets[g_ntargets++] = f_send; g_targets[g_ntargets++] = f_open; g_targets[g_ntargets++] = f_perf; g_targets[g_ntargets++] = f_upd; g_targets[g_ntargets++] = f_tick;
  // managed GameReceiver hooks (RVAs per game build, from hook.cfg: "ga_send_event=0x336FA0" / "ga_send_resp=0x336DA0")
  HMODULE ga = GetModuleHandleA("GameAssembly.dll");
  char cfgp[MAX_PATH], line[256]; snprintf(cfgp, MAX_PATH, "%s\\hook.cfg", g_dir);
  FILE *cf = fopen(cfgp, "rb"); unsigned long rvaEv = 0, rvaResp = 0;
  if (cf) { while (fgets(line, sizeof line, cf)) { if (!strncmp(line, "ga_send_event=", 14)) rvaEv = strtoul(line + 14, 0, 16); if (!strncmp(line, "ga_send_resp=", 13)) rvaResp = strtoul(line + 13, 0, 16); } fclose(cf); }
  void *autoEv = 0, *autoResp = 0;
  if (ga) { for (int w = 0; w < 300 && !autoEv; w++) { autoEv = resolve_managed(ga, "FM.GamePlugin", "GameReceiver", "SendEvent", 2); if (!autoEv) Sleep(100); }
            autoResp = resolve_managed(ga, "FM.GamePlugin", "GameReceiver", "SendDataResponse", 2);
            if (!autoResp) {
              g_last_mi = 0; void *any = resolve_managed(ga, "FM.GamePlugin", "GameReceiver", "SendDataResponse", -1);
              describe_method(ga, g_last_mi, "SendDataResponse(changed)");
              if (any && param_count(ga, g_last_mi) == 2) autoResp = any; // same shape, safe to hook
              else if (any && param_count(ga, g_last_mi) == 3) { autoResp = any; g_resp3 = 1; } // keys, sizes, items
            } }
  logf_("il2cpp resolve: SendEvent=%p SendDataResponse=%p (cfg ev=%lx resp=%lx)", autoEv, autoResp, rvaEv, rvaResp);
  if (autoEv) { rvaEv = (unsigned long)((uint8_t *)autoEv - (uint8_t *)ga); }
  if (autoResp) { rvaResp = (unsigned long)((uint8_t *)autoResp - (uint8_t *)ga); }
  if (ga && rvaEv) { void *t = (uint8_t *)ga + rvaEv; if (MH_CreateHook(t, h_m_send_event, (void **)&o_m_send_event) == MH_OK) g_targets[g_ntargets++] = t; }
  if (ga && rvaResp) { void *t = (uint8_t *)ga + rvaResp;
    if (g_resp3 ? MH_CreateHook(t, h_m_send_resp3, (void **)&o_m_send_resp3) == MH_OK : MH_CreateHook(t, h_m_send_resp, (void **)&o_m_send_resp) == MH_OK) g_targets[g_ntargets++] = t; }
  int re = MH_EnableHook(MH_ALL_HOOKS); g_hooked = 1;
  logf_("fmhook v6: hooks create %d %d %d %d %d managed ev=%lx resp=%lx (n=%d) enable %d", r1, r2, r3, r4, r5, rvaEv, rvaResp, g_ntargets, re);
  return 0;
}

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, LPVOID r) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(h);
    InitializeCriticalSection(&g_cs);
    GetModuleFileNameA(h, g_dir, MAX_PATH); char *s = strrchr(g_dir, '\\'); if (s) *s = 0;
    char lp[MAX_PATH]; snprintf(lp, MAX_PATH, "%s\\fmhook.log", g_dir);
    g_log = fopen(lp, "ab");
    logf_("=== fmhook v6 loaded pid=%lu", GetCurrentProcessId());
    CloseHandle(CreateThread(0, 0, init_thread, h, 0, 0));
  }
  return TRUE;
}
