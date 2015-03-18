
#include "Base.h"

/** Default constructor. **/
Base::Base() {

	lLastTickValue		= 0;
	iwindow_width 		= 1280;
	iwindow_height 		= 720;
	cwindow_title 		= 0;

	ScreenSurface 		= 0;

	iFPSTickCounter 	= 0;
	iFPSCounter 		= 0;
	iCurrentFPS 		= 0;

	bMinimized 			= false;
	bQuit 				= false;
	window 				= 0;

	//OpenGL
	Angle 		= 0.0;
	iModel 		= 0;
	Program 	= 0;
	iProj 		= 0;
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
	iwindow_width	= iWidth;
	iwindow_height	= iHeight;
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

	//Create a window with the specified height and width.
	ConfigureWindow( iwindow_width, iwindow_height );

	window = SDL_CreateWindow("3D Game Framework!", 0, 0, iwindow_width, iwindow_height, SDL_WINDOWEVENT_SHOWN | SDL_WINDOW_FULLSCREEN);
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

// Standard GL perspective matrix creation
void Base::Persp(float Proj[4][4], const float FOV, const float ZNear, const float ZFar)
{
    const float Delta   = ZFar - ZNear;

    memset(Proj, 0, sizeof(Proj));

    Proj[0][0] = 1.0f / tanf(FOV * 3.1415926535f / 360.0f);
    Proj[1][1] = Proj[0][0] / ((float)ScreenSurface->h / ScreenSurface->w);

    Proj[2][2] = -(ZFar + ZNear) / Delta;
    Proj[2][3] = -1.0f;
    Proj[3][2] = -2.0f * ZFar * ZNear / Delta;
}



// Simple function to create a shader
void Base::LoadShader(char *Code, int ID)
{
    // Compile the shader code
    glShaderSource  (ID, 1, (const char **)&Code, NULL);
    glCompileShader (ID);

    // Verify that it worked
    int ShaderStatus;
    glGetShaderiv(ID, GL_COMPILE_STATUS, &ShaderStatus);

    // Check the compile status
    if (ShaderStatus != GL_TRUE) {
        printf("Error: Failed to compile GLSL program\n");
        int Len = 1024;
        char Error[1024];
        glGetShaderInfoLog(ID, 1024, &Len, Error);
        printf("%s",Error);
        exit (-1);
    }
}

// Initializes the shader application data
int Base::InitializeShader(void)
{
    // Very basic ambient+diffusion model
    const char VertexShader[] = "                   \
        attribute vec3 Position;                    \
        attribute vec3 Normal;                      \
                                                    \
        uniform mat4 Proj;                          \
        uniform mat4 Model;                         \
                                                    \
        varying vec3 NormVec;                       \
        varying vec3 LighVec;                       \
                                                    \
        void main(void)                             \
        {                                           \
            vec4 Pos = Model * vec4(Position, 1.0); \
                                                    \
            gl_Position = Proj * Pos;               \
                                                    \
            NormVec     = (Model * vec4(Normal,0.0)).xyz;     \
            LighVec     = -Pos.xyz;                 \
        }                                           \
    ";

    const char FragmentShader[] = "                                             \
        varying highp vec3 NormVec;                                             \
        varying highp vec3 LighVec;                                             \
                                                                                \
        void main(void)                                                         \
        {                                                                       \
            lowp vec3 Color = vec3(1.0, 0.0, 0.0);                              \
                                                                                \
            mediump vec3 Norm  = normalize(NormVec);                            \
            mediump vec3 Light = normalize(LighVec);                            \
                                                                                \
            mediump float Diffuse = dot(Norm, Light);                           \
                                                                                \
            gl_FragColor = vec4(Color * (max(Diffuse, 0.0) * 0.6 + 0.4), 0.5);  \
        }                                                                       \
    ";

    // Create 2 shader programs
    Shader[0] = glCreateShader(GL_VERTEX_SHADER);
    Shader[1] = glCreateShader(GL_FRAGMENT_SHADER);

    LoadShader((char *)VertexShader, Shader[0]);
    LoadShader((char *)FragmentShader, Shader[1]);

    // Create the prorgam and attach the shaders & attributes
    Program   = glCreateProgram();

    glAttachShader(Program, Shader[0]);
    glAttachShader(Program, Shader[1]);

    glBindAttribLocation(Program, 0, "Position");
    glBindAttribLocation(Program, 1, "Normal");

    // Link
    glLinkProgram(Program);

    // Validate our work thus far
    int ShaderStatus;
    glGetProgramiv(Program, GL_LINK_STATUS, &ShaderStatus);

    if (ShaderStatus != GL_TRUE) {
        printf("Error: Failed to link GLSL program\n");
        int Len = 1024;
        char Error[1024];
        glGetProgramInfoLog(Program, 1024, &Len, Error);
        printf("%s",Error);
        exit(-1);
    }

    glValidateProgram(Program);

    glGetProgramiv(Program, GL_VALIDATE_STATUS, &ShaderStatus);

    if (ShaderStatus != GL_TRUE) {
        printf("Error: Failed to validate GLSL program\n");
        exit(-1);
    }

    // Enable the program
    glUseProgram                (Program);
    glEnableVertexAttribArray   (0);
    glEnableVertexAttribArray   (1);

    // Setup the Projection matrix
    Persp(Proj, 70.0f, 0.1f, 200.0f);

    // Retrieve our uniforms
    iProj   = glGetUniformLocation(Program, "Proj");
    iModel  = glGetUniformLocation(Program, "Model");

    // Basic GL setup
    glClearColor    (0.0, 0.0, 0.0, 1.0);
    glEnable        (GL_CULL_FACE);
    glCullFace      (GL_BACK);

    return GL_TRUE;
}

// Main-loop workhorse function for displaying the object
void Base::Display(void)
{
    // Clear the screen
    glClear (GL_COLOR_BUFFER_BIT);

    float Model[4][4];

    memset(Model, 0, sizeof(Model));

    // Setup the Proj so that the object rotates around the Y axis
    // We'll also translate it appropriately to Display
    Model[0][0] = cosf(Angle);
    Model[1][1] = 1.0f;
    Model[2][0] = sinf(Angle);
    Model[0][2] = -sinf(Angle);
    Model[2][2] = cos(Angle);
    Model[3][2] = -1.0f;
    Model[3][3] = 1.0f;

    // Constantly rotate the object as a function of time
    Angle = SDL_GetTicks() * 0.001f;

    // Vertex information
    float PtData[][3] = {
        {0.5f, 0.0380823f, 0.028521f},
        {0.182754f, 0.285237f, 0.370816f},
        {0.222318f, -0.2413f, 0.38028f},
        {0.263663f, -0.410832f, -0.118163f},
        {0.249651f, 0.0109279f, -0.435681f},
        {0.199647f, 0.441122f, -0.133476f},
        {-0.249651f, -0.0109279f, 0.435681f},
        {-0.263663f, 0.410832f, 0.118163f},
        {-0.199647f, -0.441122f, 0.133476f},
        {-0.182754f, -0.285237f, -0.370816f},
        {-0.222318f, 0.2413f, -0.38028f},
        {-0.5f, -0.0380823f, -0.028521f},
    };

    // Face information
    unsigned short FaceData[][3] = {
        {0,1,2,},
        {0,2,3,},
        {0,3,4,},
        {0,4,5,},
        {0,5,1,},
        {1,5,7,},
        {1,7,6,},
        {1,6,2,},
        {2,6,8,},
        {2,8,3,},
        {3,8,9,},
        {3,9,4,},
        {4,9,10,},
        {4,10,5,},
        {5,10,7,},
        {6,7,11,},
        {6,11,8,},
        {7,10,11,},
        {8,11,9,},
        {9,11,10,},
    };


    // Draw the icosahedron
    glUseProgram            (Program);
    glUniformMatrix4fv      (iProj, 1, false, (const float *)&Proj[0][0]);
    glUniformMatrix4fv      (iModel, 1, false, (const float *)&Model[0][0]);

    glVertexAttribPointer   (0, 3, GL_FLOAT, 0, 0, &PtData[0][0]);
    glVertexAttribPointer   (1, 3, GL_FLOAT, GL_TRUE, 0, &PtData[0][0]);

    glDrawElements          (GL_TRIANGLES, sizeof(FaceData) / sizeof(unsigned short),
                             GL_UNSIGNED_SHORT, &FaceData[0][0]);
}



