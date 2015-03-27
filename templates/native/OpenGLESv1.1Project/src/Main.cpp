#include <stdio.h>
#include <SDL.h>
#include <SDL_opengles.h>

#define PI 3.1415926534f
#define TO_RADIAN(a) (a/180.0f*PI)

static const int WIDTH  = 1920;
static const int HEIGHT = 1280;

static GLubyte indices[36] =
{
    0, 2, 3, 0, 3, 1,   // front
    2, 4, 5, 2, 5, 3,   // left
    4, 6, 7, 4, 7, 5,   // back
    6, 0, 1, 6, 1, 7,   // right
    0, 6, 4, 0, 4, 2,   // top
    1, 3, 5, 1, 5, 7    // bottom
};

static GLfloat vertices[8][3] =
{
    {0.5f,  0.5f, -0.5f},   // 0
    {0.5f, -0.5f, -0.5f},   // 1
    {-0.5f,  0.5f, -0.5f},  // 2
    {-0.5f, -0.5f, -0.5f},  // 3
    {-0.5f,  0.5f,  0.5f},  // 4
    {-0.5f, -0.5f,  0.5f},  // 5
    {0.5f,  0.5f,  0.5f},   // 6
    {0.5f, -0.5f,  0.5f}    // 7
};

static GLubyte colors[8][4] =
{
    {255, 255, 255, 255},     // 0
    {255,   0,   0, 255},     // 1
    {255, 255,   0, 255},     // 2
    {255,   0, 255, 255},     // 3
    {0,   255, 255, 255},     // 4
    {0,   255,   0, 255},     // 5
    {0,     0, 255, 255},     // 6
    {128, 255, 128, 255}      // 7
};

static void InitializeRender(int width, int height);
static void Render(int width, int height);
static void FinalizeRender(SDL_Window *window);

int main( int argc, char* argv[] )
{
    // Declare the window we'll be rendering to
    SDL_Window *window = NULL;
    SDL_GLContext context = 0;
    Uint32 flags = SDL_WINDOW_OPENGL | SDL_WINDOW_FULLSCREEN;
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

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 1);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 1);
    context = SDL_GL_CreateContext(window);
    if(!context) {
        printf("[testgles] SDL_GL_CreateContext failed: %s\n", SDL_GetError());
        goto cleanup;
    }

    if( SDL_GL_MakeCurrent(window, context) < 0 ) {
        printf("[testgles] SDL_GL_MakeCurrent failed: %s\n", SDL_GetError());
        goto cleanup;
    }

    // Create renderer with OpenGL ES v1.1
    InitializeRender(WIDTH, HEIGHT);

    //ToDo: Initialize your stub...

    // Start application loop
    while(quit == false)
    {
        // Clear the entire screen
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        //ToDo: ...

        // Start to poll event
        while(SDL_PollEvent(&event))
        {
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

            //ToDo: Event handling
        }

        // Refresh the entire screen
        if(foreground == 1) {
            glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            Render(WIDTH, HEIGHT);
            SDL_GL_SwapWindow(window);
        }
    }

    // ToDo: Finalize your stub...

    // Finalize SDL
    FinalizeRender(window);

cleanup:
    SDL_GL_DeleteContext(context);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}

static void InitializeRender(int width, int height)
{
    const GLfloat PROJECTION_FAR  = 30.0f;
    const GLfloat PROJECTION_FOVY = 30.0f;
    const GLfloat PROJECTION_NEAR = 0.1f;

    GLfloat matProjection[16];
    memset(matProjection,0x00,sizeof(matProjection));

    GLfloat aspect_ratio = (GLfloat)(height)/(GLfloat)(width);

    GLfloat f = PROJECTION_FAR;
    GLfloat n = PROJECTION_NEAR;
    GLfloat t = (GLfloat)tan((PROJECTION_FOVY/180.0*PI)/2.0f)*n;
    GLfloat r = t/aspect_ratio;

    matProjection[0]  = n / r;
    matProjection[5]  = n / t;
    matProjection[10] = -(f+n)/(f-n);
    matProjection[11] = -1.0f;
    matProjection[14] = -(2.0f*f*n)/(f-n);

    glEnable(GL_CULL_FACE);
    glCullFace(GL_FRONT);
    glDisable(GL_TEXTURE);
    glEnable(GL_DEPTH_TEST);

    glMatrixMode(GL_PROJECTION);
    glLoadMatrixf(matProjection);

    glEnableClientState(GL_VERTEX_ARRAY);
    glDisableClientState(GL_NORMAL_ARRAY);
    glDisableClientState(GL_TEXTURE_COORD_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);

    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
}

static void Render(int width, int height)
{
    static GLfloat angle = 0.0f;
    static GLfloat depth = -5.0f;

    glColorPointer(4, GL_UNSIGNED_BYTE, 0, colors);
    glEnableClientState(GL_COLOR_ARRAY);
    glVertexPointer(3, GL_FLOAT, 0, vertices);
    glEnableClientState(GL_VERTEX_ARRAY);

    angle+=1.0f;

    if(angle >360.0f) {
        angle-=360.0f;
    }

    depth=-5.0f-sin(TO_RADIAN(angle))*2.0f;

    glViewport(0,0,width, height);
    glMatrixMode(GL_MODELVIEW);

    glLoadIdentity();
    glTranslatef(0.0f, 0.0f, depth);
    glRotatef(angle, 1.0f, 1.0f, 0.0f);
    glDrawElements(GL_TRIANGLES, 36, GL_UNSIGNED_BYTE, indices);
}

static void FinalizeRender(SDL_Window *window)
{
    /* screen clear by black for another application using opengles */
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);

    /* clear twice for double buffer */
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
    SDL_GL_SwapWindow(window);

    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
    SDL_GL_SwapWindow(window);
}
