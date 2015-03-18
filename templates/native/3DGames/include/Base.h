
#ifndef Base_H_
#define Base_H_

#include <stdio.h>
#include <math.h>

#include "GLES2/gl2.h"
#include "SDL.h"

/**
 *  The base class.
 */
class Base
{
private:

	//stores the last tick value
	long lLastTickValue;

	//FPS Counters
	int iFPSTickCounter;
	int iFPSCounter;
	int iCurrentFPS;

	//Display Area Constants
	int iwindow_width;
	int iwindow_height;
	const char* cwindow_title;

	//Check for application running or not or minimized.
	bool bQuit;
	bool bMinimized;

	//Surface Area global variables.
	SDL_Surface* ScreenSurface;
	SDL_Window * window;

	int         Shader[2];              // We have a vertex & a fragment shader
	int         Program;                // Totalling one program
	float       Angle;            		// Rotation angle of our object
	float       Proj[4][4];             // Projection matrix
	int         iProj, iModel;          // Our 2 uniforms

protected:

	//Function to update the frame rate counter
	void UpdateFPSCounter();

	//Update the window screen and the calculate the FPS.
	void UpdateSurface();

	//Set the screen width and height.
	void ConfigureWindow(const int& iWidth, const int& iHeight);

	//Handle the key events from keyboard.
	void HandleInput();

	void HandleEvent(const SDL_Event &event);

public:
	Base();
	~Base();

	void Init();
	void Start();

	/**
	 * Setter and getter methods for window title.
	 */
	void		SetWindowTitle	(const char* czTitle);

	const char* GetWindowTitle	();

	/**
	 * Displays the custom message on screen based on the defined font and size.
	 */
	void		displayText	(const char* czText,
            				int size,
            				int x, int y,
            				int fR, int fG, int fB,
            				int bR, int bG, int bB);

	SDL_Surface* GetSurface	();

	int			 GetFPS		();

	//Addition data initialized during the application launch can be implemented here.
	void CustomInitialize	() {}

	//Updates the frame rate counter
	void FPSCounter		( const int& iElapsedTime ) {}

	// Handles rendering
	void SurfaceRenderer		( SDL_Surface* pDestSurface ) {}

	/**
	 * Additional allocated data that should be cleaned up.
	 */
	void End		() {}

	/**
	 * Window is active again.
	 */
	void WindowActive	() {}

	/**
	 * Window is inactive.
	 */
	void WindowInactive	() {}


	//Key released from keyboard
	void KeyReleased (const int& iKeyEnum) {}

	//Key pressed from keyboard
	void KeyPressed	(const int& iKeyEnum) {}
	
	void Persp(float Proj[4][4], const float FOV, const float ZNear, const float ZFar);

	void LoadShader(char *Code, int ID);

	int InitializeShader(void);

	void Display(void);
	
	/**
	 * A mouse button has been released.
	 * @param iButton	Specifies if a mouse button is pressed.
	 * @param iX	The mouse position on the X-axis in pixels.
	 * @param iY	The mouse position on the Y-axis in pixels.
	 * @param iRelX	The mouse position on the X-axis relative to the last position, in pixels.
	 * @param iRelY	The mouse position on the Y-axis relative to the last position, in pixels.
	 *
	 */

	void OnMouseButtonReleased	(const int& iButton,
					 const int& iX,
					 const int& iY,
					 const int& iRelX,
					 const int& iRelY) {}

	/**
	 * A mouse button has been pressed.
	 * @param iButton	Specifies if a mouse button is pressed.
	 * @param iX	The mouse position on the X-axis in pixels.
	 * @param iY	The mouse position on the Y-axis in pixels.
	 * @param iRelX	The mouse position on the X-axis relative to the last position, in pixels.
	 * @param iRelY	The mouse position on the Y-axis relative to the last position, in pixels.
	 *
	**/
	void OnMouseButtonPressed	(const int& iButton,
					 const int& iX,
					 const int& iY,
					 const int& iRelX,
					 const int& iRelY) {}


	/**
	 * Handle the mouse pointer positions.
	 * @param iButton	Specifies if a mouse button is pressed.
	 * @param iX	The mouse position on the X-axis in pixels.
	 * @param iY	The mouse position on the Y-axis in pixels.
	 * @param iRelX	The mouse position on the X-axis relative to the last position, in pixels.
	 * @param iRelY	The mouse position on the Y-axis relative to the last position, in pixels.
	 *
	 * @bug The iButton variable is always NULL.
	 */
	void MousePointerPosition		(const int& iButton,
					 const int& iX,
					 const int& iY,
					 const int& iRelX,
					 const int& iRelY) {}
};


#endif /* Base_H_ */
