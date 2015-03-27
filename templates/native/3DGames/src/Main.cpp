/**
    Palm disclaimer
**/
#include "Base.h"
#include <stdlib.h>

class ThreeDGame: public Base
{
	//TODO: Write the override and additional methods here...
};


// Entry point
int main(int argc, char* argv[])
{
	ThreeDGame game;

	game.Init();

	if(game.InitializeShader() == false){
		return -1;
	}

	game.Display();

	game.Start();

	return 0;
}
