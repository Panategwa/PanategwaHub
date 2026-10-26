#include "../systems/game.h"
#include "ui.h"

extern Game* currentGame;

PauseMenuAction DrawPauseMenu(int screenWidth, int screenHeight)
{
    DrawRectangle(0, 0, screenWidth, screenHeight, Color{ 0, 0, 0, 120 });

    // Centered menu panel
    const int panelW = 440;
    const int panelH = 400;
    Rectangle panel = {
        screenWidth / 2.0f - panelW / 2.0f,
        200.0f,
        (float)panelW,
        (float)panelH
    };
    DrawRectangleRec(panel, Color{ 20, 26, 44, 220 });
    DrawRectangleLinesEx(panel, 3.0f, Color{ 120, 150, 210, 255 });

    int pauseX = screenWidth / 2 - MeasureText("PAUSED", 52) / 2;
    DrawTextShadowed("PAUSED", pauseX, 232, 52, RAYWHITE);

    Rectangle resumeBtn = { screenWidth / 2.0f - 150.0f, 310.0f, 300.0f, 60.0f };
    Rectangle menuBtn = { screenWidth / 2.0f - 150.0f, 390.0f, 300.0f, 60.0f };
    Rectangle friendsBtn = { screenWidth / 2.0f - 150.0f, 470.0f, 300.0f, 60.0f };
    Rectangle quitBtn = { screenWidth / 2.0f - 150.0f, 550.0f, 300.0f, 60.0f };

    if (DrawUiButton(resumeBtn, "Resume"))
    {
        return PauseMenuAction::Resume;
    }

    if (DrawUiButton(menuBtn, "Exit to Menu"))
    {
        return PauseMenuAction::ExitToMenu;
    }

    // Friends toggle button
    if (DrawUiButton(friendsBtn, "Allow friends", currentGame->friendsAllowed ? Styles::ButtonFriendsToggleBg : Styles::ButtonDefaultBg))
    {
        return PauseMenuAction::ToggleFriends;
    }

    if (DrawUiButton(quitBtn, "Quit Game"))
    {
        return PauseMenuAction::Quit;
    }

    return PauseMenuAction::None;
}