#ifndef __NATIVETEST_H__
#define __NATIVETEST_H__

#include <stdint.h>
#include <inttypes.h>
#include <stdlib.h>
#include <string.h>
#include <glib.h>
#include <stdio.h>
#include <fcntl.h>
#include <glib-object.h>
#include <luna-service2/lunaservice.h>
#include <pbnjson.h>

#define SERVICE_NAME "@SERVICE-NAME@"

extern LSPalmService *PServiceHandle;
extern LSHandle  *pub_sh;
extern LSHandle  *prv_sh;

bool echo(LSHandle *sh, LSMessage *message, void *data);
bool getUTCTime(LSHandle *sh, LSMessage *message, void *data);
bool startHeartBeat(LSHandle *sh, LSMessage *message, void *data);
bool stopHeartBeat(LSHandle *sh, LSMessage *message, void *data);

LSMethod sampleMethods[] = {
    {"echo", echo},
    {"getUTCTime", getUTCTime},
    {"startHeartBeat", startHeartBeat},
    {"stopHeartBeat", stopHeartBeat},
};

#endif
