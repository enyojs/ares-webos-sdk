
#include "Base.h"
#include "SDL_ttf.h"

/** Default constructor. **/
Base::Base()
{
    lLastTickValue        = 0;
    iwindow_width        = 1280;
    iwindow_height        = 720;
    cwindow_title        = 0;

    ScreenSurface        = 0;

    iFPSTickCounter    = 0;
    iFPSCounter        = 0;
    iCurrentFPS        = 0;

    bMinimized        = false;
    bQuit            = false;
    window            = 0;
}

/**
 * Destructor
 */
Base::~Base() {

    //Closes the SDL before destruction.
    SDL_Quit();
}

/**
 * Sets the height and width of the window
 *
 * @param iWidth The width of the window
 * @param iHeight The height of the window
 */
void Base::ConfigureWindow(const int& iWidth, const int& iHeight) {
    iwindow_width    = iWidth;
    iwindow_height    = iHeight;
}

/**
 * Initialize SDL, TTF and create the surface screen
 *
 */
void Base::Init()
{
    // Close the SDL while application closes.
    atexit( SDL_Quit );

    // Initialize SDL video
    if ( SDL_Init( SDL_INIT_VIDEO ) < 0 )
    {
        fprintf( stderr, "Unable to initialize SDL: %s\n", SDL_GetError() );
        exit( 1 );
    }

    //Initialize the SDL_ttf sub system
    TTF_Init();

    // Close the SDL_ttf while application closes.
    atexit(TTF_Quit);

    //Create a window with the specified height and width.
    ConfigureWindow( iwindow_width, iwindow_height );

    window = SDL_CreateWindow("2D Game Framework!", 0, 0, iwindow_width, iwindow_height, SDL_WINDOWEVENT_SHOWN | SDL_WINDOW_FULLSCREEN);
    ScreenSurface = SDL_GetWindowSurface(window);

    // If we fail, return error.
    if ( ScreenSurface == NULL )
    {
        fprintf( stderr, "Unable to set up video: %s\n", SDL_GetError() );
        exit( 1 );
    }

    CustomInitialize();
}

/** The main loop. **/
void Base::Start()
{
    lLastTickValue = SDL_GetTicks();
    bQuit = false;

    // Main loop: loop forever.
    while ( !bQuit )
    {
        // Handle mouse and keyboard input
        HandleInput();

        if ( bMinimized ) {
            // Release some system resources if the app. is minimized.
            // pause the application until focus in regained
            SDL_Event event;
            SDL_WaitEvent(&event);
            HandleEvent(event);
        } else {
            // Do some thinking
            UpdateFPSCounter();

            // Render stuff
            UpdateSurface();
        }
    }

    End();
}

/** Handles all controller inputs.
    @remark This function is called once per frame.
**/
void Base::HandleInput()
{
    // Poll for events, and handle the ones we care about.
    SDL_Event event;
    while ( SDL_PollEvent( &event ) )
    {
            HandleEvent(event);
    }
}

void Base::HandleEvent(const SDL_Event &event)
{
    switch ( event.type )
    {
        case SDL_KEYDOWN:
            // If escape is pressed set the Quit-flag
            if (event.key.keysym.sym == SDLK_ESCAPE)
            {
                bQuit = true;
                break;
            }

            KeyPressed( event.key.keysym.sym );
            break;

        case SDL_KEYUP:
            KeyReleased( event.key.keysym.sym );
            break;

        case SDL_QUIT:
            bQuit = true;
            break;

        case SDL_MOUSEMOTION:
            MousePointerPosition(
                    event.button.button,
                    event.motion.x,
                    event.motion.y,
                    event.motion.xrel,
                    event.motion.yrel);
            break;

        case SDL_MOUSEBUTTONUP:
            OnMouseButtonReleased(
                    event.button.button,
                    event.motion.x,
                    event.motion.y,
                    event.motion.xrel,
                    event.motion.yrel);
            break;

        case SDL_MOUSEBUTTONDOWN:
            OnMouseButtonPressed(
                    event.button.button,
                    event.motion.x,
                    event.motion.y,
                    event.motion.xrel,
                    event.motion.yrel);
            break;
    } // switch
}

/** Handles the updating routine. **/
void Base::UpdateFPSCounter()
{
    long iElapsedTicks = SDL_GetTicks() - lLastTickValue;
    lLastTickValue = SDL_GetTicks();

    FPSCounter( iElapsedTicks );

    iFPSTickCounter += iElapsedTicks;
}

/** Handles the rendering and FPS calculations. **/
void Base::UpdateSurface()
{
    ++iFPSCounter;
    if ( iFPSTickCounter >= 1000 )
    {
        iCurrentFPS = iFPSCounter;
        iFPSCounter = 0;
        iFPSTickCounter = 0;
    }

    SDL_FillRect( ScreenSurface, 0, SDL_MapRGB( ScreenSurface->format, 192, 192, 192 ) );
    displayText("Start your Game Programming using this template!!!",
                    24, 150, 80,190, 0, 55, 0,0,0);

    // Lock surface if needed
    if ( SDL_MUSTLOCK( ScreenSurface ) )
        if ( SDL_LockSurface( ScreenSurface ) < 0 )
            return;

    SurfaceRenderer( GetSurface() );

    // Unlock if needed
    if ( SDL_MUSTLOCK( ScreenSurface ) )
        SDL_UnlockSurface( ScreenSurface );

    // Tell SDL to update the whole gScreen
    SDL_UpdateWindowSurface(window);
}

/** Sets the provided text on to the screen at the defined position.
    @param czText A character array that contains the text to display on screen.
    @param size Font size.
    @param x Position.
    @param y Position.
**/
void Base::displayText(const char* czText,
        int size,
        int x, int y,
        int fR, int fG, int fB,
        int bR, int bG, int bB)
{
    TTF_Font* font = TTF_OpenFont("res/arial.ttf", size);
    if(!font) {
        printf("TTF_OpenFont: %s\n", TTF_GetError());
        // handle error
    }

    SDL_Color foregroundColor = { fR, fG, fB };
    SDL_Color backgroundColor = { bR, bG, bB };

    SDL_Surface* textSurface = TTF_RenderText_Shaded(font, czText,
                                 foregroundColor, backgroundColor);

    SDL_Rect textLocation = { x, y, 0, 0 };

    SDL_BlitSurface(textSurface, NULL, ScreenSurface, &textLocation);

    SDL_FreeSurface(textSurface);

    TTF_CloseFont(font);
}

/** Retrieve the main screen surface.
    @return A pointer to the SDL_Surface surface
    @remark The surface is not validated internally.
**/
SDL_Surface* Base::GetSurface()
{
    return ScreenSurface;
}

/** Get the current FPS.
    @return The number of drawn frames in the last second.
    @remark The FPS is only updated once each second.
**/
int Base::GetFPS()
{
    return iCurrentFPS;
}


