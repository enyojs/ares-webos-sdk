#include "Base.h"
#include <stdlib.h>

class TwoDGame: public Base
{
 //TODO: Write the override and additional methods here...
};


// Entry point
int main(int argc, char* argv[])
{
    TwoDGame game;

    game.Init();

    game.Start();

	return 0;
}
