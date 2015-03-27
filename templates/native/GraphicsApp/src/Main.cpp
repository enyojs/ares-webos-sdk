#include "SDL.h"

#include <iostream>

using namespace std;

const int SCREEN_WIDTH = 1024;
const int SCREEN_HEIGHT = 780;

int main(int argc, char* args[]) {

	//The images
	SDL_Surface* image = NULL;
	SDL_Window *screen = NULL;
	SDL_Surface *WinSurface = NULL;

	//Start SDL
	SDL_Init(SDL_INIT_EVERYTHING);

	//Set up the screen
	screen = SDL_CreateWindow("Monitor Music", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, SCREEN_WIDTH,
			SCREEN_HEIGHT, SDL_WINDOW_SHOWN);

	//If there was an error in setting up the screen
	if (screen == NULL) {
		cout << "SDL Window creation failed " << SDL_GetError() << endl;
		return false;
	}

	WinSurface = SDL_GetWindowSurface(screen);

	//Load image
	image = SDL_LoadBMP( "res/lam.bmp" );

	//DISPLAY IMAGE on left side of screen
	SDL_Rect Rect1;
	Rect1.x = 200;
	Rect1.y = 100;
	Rect1.w = 500;
	Rect1.h = 500;

	//Apply image to screen
	SDL_BlitSurface(image, &Rect1, WinSurface, NULL);

	SDL_Rect Rect;
	Rect.x = 700;
	Rect.y = 100;
	Rect.w = 200;
	Rect.h = 300;
	Uint32 Color = SDL_MapRGB(WinSurface->format, 255, 255, 0);

	SDL_FillRect(WinSurface, &Rect, Color);

	// SDL_UpdateRect(screen,0,0,0,0);

	//Update Screen
	SDL_UpdateWindowSurface(screen);

	SDL_Event event;
	int done = 0;
	while (!done) {
		/* Check for events */
		SDL_WaitEvent(&event);
		switch (event.type) {
		case SDL_KEYDOWN:
		case SDL_QUIT:
			done = 1;
			break;
		case SDL_KEYUP:

			break;
		case SDL_MOUSEBUTTONDOWN:
			/* Any button press quits the app... */
			//case SDL_QUIT:
			done = 1;
			break;
		default:
			break;
		}
	}

	//Pause
	//SDL_Delay( 2000 );

	//Free the loaded image
	SDL_FreeSurface(image);

	SDL_FreeSurface(WinSurface);

	SDL_DestroyWindow(screen);

	//Quit SDL
	SDL_Quit();

	return 0;
}

