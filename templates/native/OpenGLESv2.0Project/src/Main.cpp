#include <stdio.h>
#include <SDL.h>
#include <SDL_opengles2.h>

#define PROJECTION_FAR        30.0f
#define PROJECTION_FOVY       30.0f
#define PROJECTION_NEAR       0.1f
#define PI                    3.1415926534f
#define BUFFER_OFFSET(i) ((char *)NULL + (i))

static const int WIDTH  = 1920;
static const int HEIGHT = 1280;

static float angle = 0.0f;
static GLuint vertexID = 0;
static GLuint indiceID = 0;
static GLuint program_object = 0;
static GLuint position_loc = 0;
static GLuint color_loc = 0;
static GLuint mvp_matrix_loc = 0;

typedef struct
{
    GLfloat m[4][4];
}glMatrix;

static glMatrix projection;
static glMatrix modelview;
static glMatrix mvp;

static const GLushort indices[] =
{
    0, 2, 3, 0, 3, 1,    // front
    2, 4, 5, 2, 5, 3,    // left
    4, 6, 7, 4, 7, 5,    // back
    6, 0, 1, 6, 1, 7,    // right
    0, 6, 4, 0, 4, 2,    // top
    1, 3, 5, 1, 5, 7    // bottom
};

static const GLfloat vertices[] =
{
     0.5f,  0.5f, -0.5f, 1.0f, 1.0f, 1.0f,        // 0
     0.5f, -0.5f, -0.5f, 1.0f,    0,    0,        // 1
    -0.5f,  0.5f, -0.5f, 1.0f, 1.0f,    0,        // 2
    -0.5f, -0.5f, -0.5f, 1.0f,    0, 1.0f,        // 3
    -0.5f,  0.5f,  0.5f,    0, 1.0f, 1.0f,        // 4
    -0.5f, -0.5f,  0.5f,    0, 1.0f,    0,        // 5
     0.5f,  0.5f,  0.5f,    0,    0, 1.0f,        // 6
     0.5f, -0.5f,  0.5f,  0.5f, 1.0f, 0.5        // 7
};

static void InitShader(void);
static void InitializeRender(int width, int height);
static void Render(void);
static void FinalizeRender(SDL_Window *window);

static void TranslateMatrix(glMatrix *result, float tx, float ty, float tz);
static void MultiplyMatrix(glMatrix *result, glMatrix *srcA, glMatrix *srcB);
static void RotationMatrix(glMatrix *result, float angle, float x, float y, float z);
static void LoadIdentityMatrix(glMatrix *result);
static void PerspectiveMatrix(glMatrix *result, float fovy, float aspect, float zNear, float zFar);

int main( int argc, char* argv[] )
{
    // Declare the window we'll be rendering to
    SDL_Window *window = NULL;
    Uint32 flags = SDL_WINDOW_OPENGL | SDL_WINDOW_FULLSCREEN;
    SDL_GLContext context = 0;
    int foreground = 1;

    // Declare application loop flag
    bool quit = false;

    // Declare event object
    SDL_Event event;

    // Initialize SDL
    if(SDL_Init(SDL_INIT_EVERYTHING) < 0)
    {
        printf("SDL_Init failed: %s\n", SDL_GetError());
        return 0;
    }

    // Create window
    window = SDL_CreateWindow("", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, WIDTH, HEIGHT, flags);
    if(window == NULL)
    {
        printf("SDL_CreateWindow failed: %s\n", SDL_GetError());
        goto cleanup; 
    }

    // Create renderer with OpenGL ES v2.0
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    context = SDL_GL_CreateContext(window);
    if(!context) {
        printf("SDL_CreateWindow failed: %s\n", SDL_GetError());
        goto cleanup;
    }

    if( SDL_GL_MakeCurrent(window, context) < 0 ) {
        printf("SDL_CreateWindow failed: %s\n", SDL_GetError());
        goto cleanup;
    }

    //ToDo: Initialize your stub...
    InitializeRender(WIDTH, HEIGHT);

    // Start application loop
    while(quit == false)
    {
        // Clear the entire screen
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        //ToDo: ...

        // Start to poll event
        while(SDL_PollEvent(&event))
        {
            //ToDo: Event handling
            if(event.type == SDL_APP_DIDENTERFOREGROUND) {
                foreground = 1;
            } else if(event.type == SDL_APP_DIDENTERBACKGROUND) {
                foreground = 0;
            } else if(event.type == SDL_KEYDOWN) {
                if( event.key.keysym.sym == SDLK_LEFT ) {
                    /* graceful ternmiate */
                    event.type = SDL_QUIT;
                    SDL_PushEvent(&event);
                }
            } else if(event.type == SDL_QUIT)
            {
                // User requests quit
                quit = true;
                break;
            }
        }

        if(foreground == 1) {
            glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            Render();
            // Refresh the entire screen
            SDL_GL_SwapWindow(window);
        }
    }

    // ToDo: Finalize your stub...
    FinalizeRender(window);

    // Finalize SDL
cleanup:
    SDL_GL_DeleteContext(context);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}

static void InitShader(void)
{
    /* The shaders */
    const char vShaderStr[] =
        "uniform mat4   u_mvpMatrix;               \n"
        "attribute vec4 a_position;                \n"
        "attribute vec4 a_color;                   \n"
        "varying vec4   v_color;                   \n"
        "                                          \n"
        "void main()                               \n"
        "{                                         \n"
        "  gl_Position = u_mvpMatrix * a_position; \n"
        "  v_color = a_color;                      \n"
        "}                                         \n";

    const char fShaderStr[] =
        "precision mediump float;                  \n"
        "varying vec4 v_color;                     \n"
        "                                          \n"
        "void main()                               \n"
        "{                                         \n"
        "  gl_FragColor = v_color;                 \n"
        "}                                         \n";

    GLuint v = glCreateShader(GL_VERTEX_SHADER);
    GLuint f = glCreateShader(GL_FRAGMENT_SHADER);

    const char* vv = vShaderStr;
    const char* ff = fShaderStr;

    glShaderSource(v, 1, &vv, NULL);
    glShaderSource(f, 1, &ff, NULL);

    /* Compile the shaders */
    glCompileShader(v);
    glCompileShader(f);

    program_object = glCreateProgram();

    glAttachShader(program_object, v);
    glAttachShader(program_object, f);

    /* Link the program */
    glLinkProgram(program_object);
}

static void InitializeRender(int width, int height)
{
    /* The shaders */
    InitShader();

    /* Get the attribute locations */
    position_loc    = glGetAttribLocation(program_object, "a_position");
    color_loc        = glGetAttribLocation(program_object, "a_color");

    /* Get the uniform locations */
    mvp_matrix_loc = glGetUniformLocation(program_object, "u_mvpMatrix");

    glGenBuffers(1, &vertexID);
    glBindBuffer(GL_ARRAY_BUFFER, vertexID);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);

    glGenBuffers(1, &indiceID);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, indiceID);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices, GL_STATIC_DRAW);

    /* Init GL Status */
    glEnable(GL_DEPTH_TEST);
    glDisable(GL_BLEND);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_FRONT);

    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClearDepthf(1.0f);

    /* Make Matrix */
    float aspect_ratio = (float)(width)/height;
    LoadIdentityMatrix(&projection);
    LoadIdentityMatrix(&modelview);
    LoadIdentityMatrix(&mvp);

    PerspectiveMatrix(&projection, PROJECTION_FOVY, aspect_ratio, PROJECTION_NEAR, PROJECTION_FAR);

    /* Viewport */
    glViewport(0,0,width, height);
}

static void Render(void)
{
    LoadIdentityMatrix(&modelview);
    TranslateMatrix(&modelview, 0.0f, 0.0f, -4.0f);
    RotationMatrix(&modelview, angle, 1.0f, 1.0f, 0.0);

    angle+=0.3f;
    if(angle > 360.0f) {
        angle-=360.0f;
    }

    /* Compute the final MVP by multiplying the model-view and perspective matrices together */
    MultiplyMatrix(&mvp, &modelview, &projection);

    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);

    glUseProgram(program_object);

    /* Enable cube array */
    glBindBuffer(GL_ARRAY_BUFFER, vertexID);

    glVertexAttribPointer(position_loc, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(GLfloat), BUFFER_OFFSET(0));
    glVertexAttribPointer(color_loc,    3, GL_FLOAT, GL_FALSE, 6 * sizeof(GLfloat), BUFFER_OFFSET(3 * sizeof(GLfloat)));

    glEnableVertexAttribArray(position_loc);
    glEnableVertexAttribArray(color_loc);

    /* Load the MVP matrix */
    glUniformMatrix4fv(mvp_matrix_loc, 1, GL_FALSE, (GLfloat*)&mvp.m[0][0]);

    /* Finally draw the elements */
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, indiceID);
    glDrawElements(GL_TRIANGLES, sizeof(indices) / sizeof(GLushort), GL_UNSIGNED_SHORT, BUFFER_OFFSET(0));
}

static void FinalizeRender(SDL_Window *window)
{
    glDeleteProgram(program_object);
    glDeleteBuffers(1, &vertexID);
    glDeleteBuffers(1, &indiceID);

    /* screen clear by black for another application using opengles */
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);

    /* clear twice for double buffer */
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
    SDL_GL_SwapWindow(window);

    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
    SDL_GL_SwapWindow(window);
}

static void TranslateMatrix(glMatrix *result, float tx, float ty, float tz)
{
    result->m[3][0] += (result->m[0][0] * tx + result->m[1][0] * ty + result->m[2][0] * tz);
    result->m[3][1] += (result->m[0][1] * tx + result->m[1][1] * ty + result->m[2][1] * tz);
    result->m[3][2] += (result->m[0][2] * tx + result->m[1][2] * ty + result->m[2][2] * tz);
    result->m[3][3] += (result->m[0][3] * tx + result->m[1][3] * ty + result->m[2][3] * tz);
}

static void MultiplyMatrix(glMatrix *result, glMatrix *srcA, glMatrix *srcB)
{
    glMatrix tmp;
    int i;

    for (i=0; i<4; i++)    {
        tmp.m[i][0] =    (srcA->m[i][0] * srcB->m[0][0]) +
                        (srcA->m[i][1] * srcB->m[1][0]) +
                        (srcA->m[i][2] * srcB->m[2][0]) +
                        (srcA->m[i][3] * srcB->m[3][0]) ;

        tmp.m[i][1] =    (srcA->m[i][0] * srcB->m[0][1]) +
                        (srcA->m[i][1] * srcB->m[1][1]) +
                        (srcA->m[i][2] * srcB->m[2][1]) +
                        (srcA->m[i][3] * srcB->m[3][1]) ;

        tmp.m[i][2] =    (srcA->m[i][0] * srcB->m[0][2]) +
                        (srcA->m[i][1] * srcB->m[1][2]) +
                        (srcA->m[i][2] * srcB->m[2][2]) +
                        (srcA->m[i][3] * srcB->m[3][2]) ;

        tmp.m[i][3] =    (srcA->m[i][0] * srcB->m[0][3]) +
                        (srcA->m[i][1] * srcB->m[1][3]) +
                        (srcA->m[i][2] * srcB->m[2][3]) +
                        (srcA->m[i][3] * srcB->m[3][3]) ;
    }

    memcpy(result, &tmp, sizeof(glMatrix));
}

static void RotationMatrix(glMatrix *result, float angle, float x, float y, float z)
{
    float sinAngle, cosAngle;
    float mag = sqrtf(x * x + y * y + z * z);

    sinAngle = sinf(angle * (float)M_PI / 180.0f);
    cosAngle = cosf(angle * (float)M_PI / 180.0f);

    if (mag > 0.0f)    {
        float xx, yy, zz, xy, yz, zx, xs, ys, zs;
        float oneMinusCos;
        glMatrix rotMat;

        x /= mag;
        y /= mag;
        z /= mag;

        xx = x * x;
        yy = y * y;
        zz = z * z;
        xy = x * y;
        yz = y * z;
        zx = z * x;
        xs = x * sinAngle;
        ys = y * sinAngle;
        zs = z * sinAngle;
        oneMinusCos = 1.0f - cosAngle;

        rotMat.m[0][0] = (oneMinusCos * xx) + cosAngle;
        rotMat.m[1][0] = (oneMinusCos * xy) - zs;
        rotMat.m[2][0] = (oneMinusCos * zx) + ys;
        rotMat.m[3][0] = 0.0F;

        rotMat.m[0][1] = (oneMinusCos * xy) + zs;
        rotMat.m[1][1] = (oneMinusCos * yy) + cosAngle;
        rotMat.m[2][1] = (oneMinusCos * yz) - xs;
        rotMat.m[3][1] = 0.0F;

        rotMat.m[0][2] = (oneMinusCos * zx) - ys;
        rotMat.m[1][2] = (oneMinusCos * yz) + xs;
        rotMat.m[2][2] = (oneMinusCos * zz) + cosAngle;
        rotMat.m[3][2] = 0.0F;

        rotMat.m[0][3] = 0.0F;
        rotMat.m[1][3] = 0.0F;
        rotMat.m[2][3] = 0.0F;
        rotMat.m[3][3] = 1.0F;

        MultiplyMatrix(result, &rotMat, result);
    }
}

static void LoadIdentityMatrix(glMatrix *result)
{
    memset(result, 0x0, sizeof(glMatrix));
    result->m[0][0] = 1.0f;
    result->m[1][1] = 1.0f;
    result->m[2][2] = 1.0f;
    result->m[3][3] = 1.0f;
}

static void PerspectiveMatrix(glMatrix *result, float fovy, float aspect, float zNear, float zFar)
{
    glMatrix m;
    float sine, cotangent, deltaZ;
    float radians = fovy / 2.0f * (float)M_PI / 180.0f;

    deltaZ = zFar - zNear;
    sine = sinf(radians);
    if ((deltaZ == 0) || (sine == 0) || (aspect == 0)) {
        return;
    }
    cotangent = cosf(radians) / sine;

    m.m[0][0] = cotangent / aspect; m.m[0][1] =                          0; m.m[0][2] =                          0; m.m[0][3] =  0;
    m.m[1][0] =                  0; m.m[1][1] =                  cotangent; m.m[1][2] =                          0; m.m[1][3] =  0;
    m.m[2][0] =                  0; m.m[2][1] =                          0; m.m[2][2] =   -(zFar + zNear) / deltaZ; m.m[2][3] = -1;
    m.m[3][0] =                  0; m.m[3][1] =                          0; m.m[3][2] = -2 * zNear * zFar / deltaZ; m.m[3][3] =  0;

    MultiplyMatrix(result, &m, result);
}
