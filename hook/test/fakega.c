#include <windows.h>
#include <stdio.h>
#include <string.h>
#define X __declspec(dllexport)
typedef struct { void *a, *b; } Span;
X void ManagedSendEvent(void *self, unsigned id, Span *b, void *mi) { printf("REAL managed SendEvent id=%u\n", id); fflush(stdout); }
X void ManagedSendResp(void *self, Span *k, Span *i, void *mi) {}
static void *mi_ev[1] = { (void *)ManagedSendEvent }, *mi_resp[1] = { (void *)ManagedSendResp };
static int dom, asmv, img, klass;
static void *asms[1] = { &asmv };
X void *il2cpp_domain_get(void) { return &dom; }
X void **il2cpp_domain_get_assemblies(void *d, size_t *n) { *n = 1; return asms; }
X void *il2cpp_assembly_get_image(void *a) { return &img; }
X void *il2cpp_class_from_name(void *i, const char *ns, const char *c) { return (!strcmp(ns, "FM.GamePlugin") && !strcmp(c, "GameReceiver")) ? &klass : 0; }
X void *il2cpp_class_get_method_from_name(void *k, const char *m, int argc) { return !strcmp(m, "SendEvent") ? mi_ev : !strcmp(m, "SendDataResponse") ? mi_resp : 0; }
X void *il2cpp_thread_attach(void *d) { return 0; }
