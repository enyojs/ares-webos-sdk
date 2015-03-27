#include "SDL.h"
#include "SDL_ttf.h"
#include "SDL_mixer.h"

#include <string>
#include <iostream>

using namespace std;

//Display Area Constants
const int 	WINDOW_WIDTH	= 1280;
const int 	WINDOW_HEIGHT	= 720;
const char* WINDOW_TITLE	= "Media Application Sample!!!";

//Surface Area global variables.
SDL_Surface 	*backgroundArea 	= NULL;
SDL_Surface 	*textArea			= NULL;
SDL_Window 		*screen 			= NULL;
SDL_Surface 	*WinSurface 		= NULL;

//The event handler constant
SDL_Event event;

//TTF fonts global variables
TTF_Font *font = NULL;

//font color
SDL_Color fontColor = { 125, 125, 125 };

//Mixer information that will be played.
Mix_Music *music = NULL;

/**
 * Loads the back ground image
 */
SDL_Surface *loadImageOnSurface(std::string filePath) {

	SDL_Surface* imgSurface = NULL;

	//Load the image
	imgSurface = SDL_LoadBMP( filePath.c_str() );

	//If the image loaded
	if (imgSurface != NULL) {
		SDL_SetColorKey(imgSurface, SDL_TRUE, SDL_MapRGB(imgSurface->format, 0, 0xFF, 0xFF));
	}

	//Return the surface that contains the background image.
	return imgSurface;
}

void apply_surface(int x, int y, SDL_Surface* source, SDL_Surface* destination, SDL_Rect* clip = NULL) {

	//Holds offsets
	SDL_Rect offset;

	//Get offsets
	offset.x = x;
	offset.y = y;

	//Blit
	SDL_BlitSurface(source, clip, destination, &offset);
}


/**
 * Initialize the SDL and SDl subsystems and the window creation.
 *
 * Returns true if all the systems were properly loaded.
 */
bool initializeSDL() {

	//Initialize all SDL subsystems
	if (SDL_Init(SDL_INIT_EVERYTHING) == -1) {
		return false;
	}

	//Set up the screen
	screen = SDL_CreateWindow(WINDOW_TITLE, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, WINDOW_WIDTH,
			WINDOW_HEIGHT, SDL_WINDOW_SHOWN);

	//check for the window creation success.
	if (screen == NULL) {
		cout << "SDL Window creation failed " << SDL_GetError() << endl;
		return false;
	}

	WinSurface = SDL_GetWindowSurface(screen);

	//Initialize the fonts
	if (TTF_Init() == -1) {
		return false;
	}

	//Initialize SDL_mixer APIs
	if (Mix_OpenAudio(22050, MIX_DEFAULT_FORMAT, 2, 4096) == -1) {
		return false;
	}

	return true;
}

/**
 * Load the resources required for the project.
 */

bool load_files() {

	//Load the backgroundArea image
	backgroundArea = loadImageOnSurface("res/back.bmp");

	//If there was a problem in loading the backgroundArea
	if (backgroundArea == NULL) {
		return false;
	}

	//Open the font
	font = TTF_OpenFont("res/samplefont.ttf", 17);

	//If there was an error in loading the font
	if (font == NULL) {
		return false;
	}

	//Load the music
	music = Mix_LoadMUS("res/play.wav");

	//If there was a problem loading the music
	if (music == NULL) {
		return false;
	}

	//If Music loaded fine
	return true;
}

/**
 * Release all the resources and clean exit.
 */
void clean_up() {

	//Free the surfaces
	SDL_FreeSurface(backgroundArea);
	SDL_DestroyWindow(screen);

	//Free the music
	Mix_FreeMusic(music);

	//Close the font
	TTF_CloseFont(font);

	//Quit SDL_mixer
	Mix_CloseAudio();

	//Quit SDL_ttf
	TTF_Quit();

	//Quit SDL
	SDL_Quit();
}


/**
 * Starting point of the program
 */
int main(int argc, char* args[]) {

	//Quit flag
	bool quit = false;

	//Initialize the SDL sub systems.
	if (initializeSDL() == false) {
		return 1;
	}

	//Load the files
	if (load_files() == false) {
		return 1;
	}

	//Apply the backgroundArea
	apply_surface(0, 0, backgroundArea, WinSurface);

	//Render the text
	textArea = TTF_RenderText_Solid(font, "Press 1 to play or pause the music", fontColor);

	//If there was an error in rendering the text
	if (textArea == NULL) {
		return 1;
	}

	//Show the textArea on the screen
	apply_surface((WINDOW_WIDTH - textArea->w) / 2, 200, textArea, WinSurface);

	//Free the textArea
	SDL_FreeSurface(textArea);

	//Render the text
	textArea = TTF_RenderText_Solid(font, "Press 0 to stop the music", fontColor);

	//If there was an error in rendering the text
	if (textArea == NULL) {
		return 1;
	}

	//Show the textArea on the screen
	apply_surface((WINDOW_WIDTH - textArea->w) / 2, 300, textArea, WinSurface);

	//Free the textArea
	SDL_FreeSurface(textArea);

	//Update the screen
	if (SDL_UpdateWindowSurface(screen) == -1) {
		return 1;
	}

	//While the user hasn't quit
	while (quit == false) {
		//While there's events to handle
		while (SDL_PollEvent(&event)) {
			//If a key was pressed
			if (event.type == SDL_KEYDOWN) {
				//If 1 was pressed
				if (event.key.keysym.sym == SDLK_1) {
					//If there is no music playing
					if (Mix_PlayingMusic() == 0) {
						//Play the music
						if (Mix_PlayMusic(music, -1) == -1) {
							return 1;
						}
					}
					//If music is being played
					else {
						//If the music is paused
						if (Mix_PausedMusic() == 1) {
							//Resume the music
							Mix_ResumeMusic();
						}
						//If the music is playing
						else {
							//Pause the music
							Mix_PauseMusic();
						}
					}
				}

				//If 0 was pressed
				else if (event.key.keysym.sym == SDLK_0) {
					//Stop the music
					Mix_HaltMusic();
				}
			}

			//If the user has Xed out the window
			if (event.type == SDL_QUIT || event.type == SDL_MOUSEBUTTONDOWN) {
				//Quit the program
				quit = true;
			}
		}
	}

	//Free surfaces, fonts and sounds
	//then quit SDL_mixer, SDL_ttf and SDL
	clean_up();

	return 0;
}

