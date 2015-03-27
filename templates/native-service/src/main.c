#include <stdlib.h>
#include <string.h>
#include <glib.h>
#include <stdio.h>
#include <glib-object.h>
#include <lunaservice.h>
#include <sample.h>


GMainLoop *gmainLoop;

LSPalmService *PServiceHandle;
LSHandle  *pub_sh = NULL;
LSHandle  *prv_sh = NULL;
LSMessage *returnValue;
static unsigned long int count = 0;
gint timerId = 0;

#define BUF_SIZE 64
#define STRINGLENGTH 128

// a method that always returns the same value
bool echo(LSHandle *sh, LSMessage *message, void *data) 
{
    LSError lserror;
    JSchemaInfo schemaInfo;
    jvalue_ref parsed = {0}, value = {0};
    const char *input = NULL;
    char buf[BUF_SIZE] = {0, };

    LSErrorInit(&lserror);

    // Initialize schema
    jschema_info_init (&schemaInfo, jschema_all(), NULL, NULL);

    // get message from LS2 and parsing to make object
    parsed = jdom_parse(j_cstr_to_buffer(LSMessageGetPayload(message)), DOMOPT_NOOPT, &schemaInfo);

    if (jis_null(parsed)){
      j_release(&parsed);
      return true;
    }

    value = jobject_get(parsed, j_cstr_to_buffer("input"));

    // JSON Object to string without schema validation check
    input = jvalue_tostring_simple(value);

    //LSMessageReply(sh, message, jvalue_tostring_simple(jobj), &lserror);
    LSMessageReply(sh, message, input, &lserror);

    j_release(&parsed);
    return true;
}



static bool replyHandlerCB(LSHandle *sh, LSMessage *message, void *user_data)
{
    LSError lserror;
    JSchemaInfo schemaInfo;
    jvalue_ref parsed = {0}, jobj = {0}, subjobj = {0};
    const char *utcTime = NULL;

    LSErrorInit(&lserror);

    // Initialize schema
    jschema_info_init (&schemaInfo, jschema_all(), NULL, NULL);

    // get message from LS2 and parsing to make object
    parsed  = jdom_parse(j_cstr_to_buffer(LSMessageGetPayload(message)),DOMOPT_NOOPT, &schemaInfo);

    if (jis_null(parsed)){
      j_release(&parsed);
      return true;
    }

    utcTime = jvalue_tostring_simple(jobject_get(parsed, j_cstr_to_buffer("utc")));

    // create an empty JSON object node
    jobj = jobject_create();

    if (jis_null(jobj)){
      j_release(&jobj);
      return true;
    }


    // Create JSON String
    subjobj = j_cstr_to_jval(utcTime);

    if (jis_null(subjobj)){
      j_release(&subjobj);
      return true;
    }

    // Add JSON String to JSON Object
    jobject_set(jobj, j_cstr_to_buffer("utcTime"), subjobj);

    if(returnValue != NULL){
        LSMessageReply(sh, returnValue, jvalue_tostring_simple(jobj), &lserror);
        LSMessageUnref(returnValue);
    }

    j_release(&parsed);
    j_release(&jobj);
    j_release(&subjobj);
    return true;
}

// call another service
bool getUTCTime(LSHandle *sh, LSMessage *message, void *data)
{
    LSError lserror;

    LSErrorInit(&lserror);

    if (false == LSCall(sh,
                        "luna://com.palm.systemservice/time/getSystemTime",
                        "{}",
                        replyHandlerCB,
                        NULL,
                        NULL,
                        &lserror))
    {
        LSErrorPrint(&lserror, stderr);
        LSErrorFree(&lserror);
    }

    LSMessageRef(message);
    returnValue = message;

    return true;
}


// handle subscription requests
static bool isSubscription(LSMessage *message)
{
    JSchemaInfo schemaInfo;
    jvalue_ref jobj = {0};

    // Initialize schema
    jschema_info_init (&schemaInfo, jschema_all(), NULL, NULL);

    // get message from LS2 and parsing to make object
    jobj = jdom_parse(j_cstr_to_buffer(LSMessageGetPayload(message)),DOMOPT_NOOPT, &schemaInfo);

    if (jis_null(jobj)){
      j_release(&jobj);
      return true;
    }

    return jobject_containskey(jobj, j_cstr_to_buffer("subscribe"));
}

static bool addSubscription(LSHandle *sh, char *key, LSMessage *message)
{
    LSError lserror;

    if (!pub_sh || !message){
        return false;
    }

    LSErrorInit(&lserror);

    if (!LSSubscriptionAdd(sh, key,  message, &lserror)){
        LSErrorPrint(&lserror, stderr);
        LSErrorFree(&lserror);
        return false;
    }
    return true;
}

static bool removeSubscription(char *key, LSMessage *message)
{
    LSError lserror;
    LSSubscriptionIter *iterator = NULL;
    char *strSender;
    char *strSubscriptor;

    if (!pub_sh || !message){
        return false;
    }

    LSErrorInit(&lserror);

    if (!LSSubscriptionAcquire(pub_sh, key, &iterator, &lserror)){
        LSErrorPrint(&lserror, stderr);
        LSErrorFree(&lserror);
        return false;
    }

    strSender = malloc(STRINGLENGTH);
    memset(strSender, 0x0, STRINGLENGTH);
    strcpy(strSender, LSMessageGetSender(message));

    while(LSSubscriptionHasNext(iterator)){
        LSMessage *subscribeMessage = LSSubscriptionNext(iterator);
        strSubscriptor = malloc(STRINGLENGTH);
        memset(strSender, 0x0, STRINGLENGTH);
        strcpy(strSubscriptor, LSMessageGetSender(subscribeMessage));

        if (strSender == strSubscriptor){
            LSSubscriptionRemove(iterator);
            break;
        }
    }

    LSSubscriptionRelease(iterator);

    return true;
}

static bool replyAllSubscriptions(char *key, jvalue_ref replyjobj)
{
    LSError lserror;
    LSErrorInit(&lserror);

    if (!LSSubscriptionReply(pub_sh, key, jvalue_tostring_simple(replyjobj), &lserror)){
        LSErrorPrint(&lserror, stderr);
        LSErrorFree(&lserror);
    }
    if (!LSSubscriptionReply(prv_sh, key, jvalue_tostring_simple(replyjobj), &lserror)){
        LSErrorPrint(&lserror, stderr);
        LSErrorFree(&lserror);
    }
    return true;
}

static gint onTimerCB(gpointer data)
{
    jvalue_ref resultjobj={0};
    int64_t *pCount = (int64_t *)data;

    (*pCount)++;
    resultjobj = jobject_create();

    if (jis_null(resultjobj)){
      j_release(&resultjobj);
      return true;
    }

    jobject_set(resultjobj, j_cstr_to_buffer("heartbeat"), jnumber_create_i64((*pCount)));

    replyAllSubscriptions("heartbeat", resultjobj);

    j_release(&resultjobj);
    return TRUE;
}

bool startHeartBeat(LSHandle *sh, LSMessage *message, void *data)
{
    LSError lserror;
    jvalue_ref jobj = {0}, subjobj = {0};

    bool bRet = TRUE;

    LSErrorInit(&lserror);
    if(isSubscription(message)){
        addSubscription(sh, "heartbeat", message);
    }

    if(count == 0){
        timerId = g_timeout_add(1000, onTimerCB, &count);
    }

    jobj = jobject_create();
    if (jis_null(jobj)){
      j_release(&jobj);
      return true;
    }

    subjobj = jboolean_create(bRet);
    if (jis_null(subjobj)){
      j_release(&subjobj);
      return true;
    }

    jobject_set(jobj, j_cstr_to_buffer("returnValue"), subjobj);

    LSMessageReply(sh, message,jvalue_tostring_simple(jobj), &lserror);

    j_release(&jobj);
    j_release(&subjobj);
    return true;
}


bool stopHeartBeat(LSHandle *sh, LSMessage *message, void *data)
{
    LSError lserror;
    jvalue_ref jobj = {0}, subjobj = {0};

    bool bRet = TRUE;

    LSErrorInit(&lserror);

    count = 0;
    removeSubscription("heartbeat", message);
    g_source_remove(timerId);

    jobj = jobject_create();
    if (jis_null(jobj)){
      j_release(&jobj);
      return true;
    }

    subjobj = jboolean_create(bRet);
    if (jis_null(subjobj)){
      j_release(&subjobj);
      return true;
    }

    jobject_set(jobj, j_cstr_to_buffer("returnValue"), subjobj);

    LSMessageReply(sh, message,jvalue_tostring_simple(jobj), &lserror);

    j_release(&jobj);
    j_release(&subjobj);
    return true;
}


int main(int argc, char* argv[])
{
    LSError lserror;
    bool bRetVal = FALSE;

    LSErrorInit(&lserror);

    // create a GMainLoop
    gmainLoop = g_main_loop_new(NULL, FALSE);

    bRetVal = LSRegisterPalmService(SERVICE_NAME, &PServiceHandle, &lserror);
    if (FALSE== bRetVal){
        LSErrorFree( &lserror );
        return 0;
    }
    pub_sh = LSPalmServiceGetPublicConnection(PServiceHandle);
    prv_sh = LSPalmServiceGetPrivateConnection(PServiceHandle);

    LSPalmServiceRegisterCategory(PServiceHandle, "/", sampleMethods, sampleMethods, NULL, NULL, &lserror);

    LSGmainAttachPalmService(PServiceHandle, gmainLoop, &lserror);

    // run to check continuosly for new events from each of the event sources
    g_main_loop_run(gmainLoop);
    // Decreases the reference count on a GMainLoop object by one
    g_main_loop_unref(gmainLoop);

    return 0;
}
