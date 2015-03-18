#include <stdio.h>
#include <SDL.h>

static const int WIDTH  = 1920;
static const int HEIGHT = 1280;

int main( int argc, char* argv[] )
{
    // Declare the window we'll be rendering to
    SDL_Window *window = NULL;
    SDL_Renderer *renderer = NULL;
    Uint32 flags = SDL_WINDOW_OPENGL | SDL_WINDOW_FULLSCREEN;

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
        return 0;
    }

    // Create renderer with default
    renderer = SDL_CreateRenderer(window, 1, SDL_RENDERER_ACCELERATED);
    if(renderer == NULL)
    {
        printf("SDL_CreateRenderer failed: %s\n", SDL_GetError());
        return 0;
    }

    // Clear the entire screen
    if(SDL_RenderClear(renderer) < 0)
    {
        printf("SDL_RenderClear failed: %s\n", SDL_GetError());
        return 0;
    }

    //ToDo: Initialize your stub...

    // Start application loop
    while(quit == false)
    {
        // ToDo: ...

        // Start to poll event
        while(SDL_PollEvent(&event))
        {
            // User requests quit
            if(event.type == SDL_QUIT)
            {
                quit = true;
                break;
            }

            //ToDo: Event handling
        }

        // Up until now everything was drawn behind the scenes.
        SDL_RenderPresent(renderer);
    }

    // ToDo: Finalize your stub...

    // Finalize SDL
    SDL_Quit();
    return 0;
}

