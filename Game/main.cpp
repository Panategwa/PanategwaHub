#include "raylib.h"
#include "src/systems/game.h"
#include "src/ui/inventory.h"
#include "src/ui/styles.h"

static bool EscapePressedOnce()
{
    static bool wasDown = false;
    bool isDown = IsKeyDown(KEY_ESCAPE);
    bool pressed = isDown && !wasDown;
    wasDown = isDown;
    return pressed;
}

extern int selectedWorldIndex;
extern char worldNameInput[];
extern char renameInput[];
extern bool friendsToggle;
extern bool showError;
extern float errorTimer;
Game* currentGame = nullptr;

int main()
{
    const int screenWidth = 1920;
    const int screenHeight = 1080;

    std::string windowTitle = std::string("Xenoterra v") + Styles::GameVersion;
    InitWindow(screenWidth, screenHeight, windowTitle.c_str());
    ToggleFullscreen();
    SetTargetFPS(60);
    SetExitKey(KEY_NULL);

    Game game;
    currentGame = &game;
    InitGame(game);

    while (game.running && !WindowShouldClose())
    {
        if (game.state == GameState::Playing)
        {
            if (EscapePressedOnce())
            {
                game.state = GameState::Paused;
            }
            else
            {
                UpdateGameplay(game, screenWidth, screenHeight);
            }
        }
        else if (game.state == GameState::Paused)
        {
            if (EscapePressedOnce())
            {
                game.state = GameState::Playing;
            }
        }

        // Determine cursor visibility: inventory active OR game not in Playing state
        bool cursorShouldBeVisible = game.inventory.storageOpen || game.inventory.isHolding || (game.state != GameState::Playing);

        if (cursorShouldBeVisible && game.cursorHidden)
        {
            EnableCursor();
            game.cursorHidden = false;
        }
        else if (!cursorShouldBeVisible && !game.cursorHidden)
        {
            DisableCursor();
            game.cursorHidden = true;
        }

        BeginDrawing();
        ClearBackground(SKYBLUE);

        if (game.state == GameState::MainMenu)
        {
            MainMenuAction action = DrawMainMenu(screenWidth, screenHeight);

            if (action == MainMenuAction::Play)
            {
                game.state = GameState::WorldSelection;
            }
            else if (action == MainMenuAction::Quit)
            {
                game.running = false;
            }
        }
        else if (game.state == GameState::WorldSelection)
        {
            MainMenuAction action = DrawWorldSelection(screenWidth, screenHeight);

            if (action == MainMenuAction::Play)
            {
                // Load selected world
                std::vector<WorldData> worlds = GetWorldList();
                if (selectedWorldIndex >= 0 && selectedWorldIndex < (int)worlds.size())
                {
                    if (LoadWorld(game, worlds[selectedWorldIndex].name))
                    {
                        game.state = GameState::Playing;
                    }
                }
            }
            else if (action == MainMenuAction::CreateWorld)
            {
                std::string worldName(worldNameInput);
                if (worldName.empty())
                {
                    // Don't create world with empty name
                }
                else if (!IsValidWorldName(worldName) || WorldExists(worldName))
                {
                    // World already exists, show error
                    showError = true;
                    extern float errorTimer;
                    errorTimer = 5.0f;
                }
                else
                {
                    GenerateWorld(game);
                    game.currentWorldName = worldName;
                    game.friendsAllowed = friendsToggle;
                    if (SaveWorld(game, worldName))
                    {
                        game.state = GameState::Playing;
                    }
                }
            }
            else if (action == MainMenuAction::DeleteWorld)
            {
                // Delete selected world
                std::vector<WorldData> worlds = GetWorldList();
                if (selectedWorldIndex >= 0 && selectedWorldIndex < (int)worlds.size())
                {
                    DeleteWorld(worlds[selectedWorldIndex].name);
                    selectedWorldIndex = -1;
                }
            }
            else if (action == MainMenuAction::RenameWorld)
            {
                // Rename selected world
                std::vector<WorldData> worlds = GetWorldList();
                if (selectedWorldIndex >= 0 && selectedWorldIndex < (int)worlds.size())
                {
                    std::string newName(renameInput);
                    if (!newName.empty())
                    {
                        RenameWorld(worlds[selectedWorldIndex].name, newName);
                        selectedWorldIndex = -1;
                    }
                }
            }
            else if (action == MainMenuAction::Quit)
            {
                game.state = GameState::MainMenu;
            }
        }
        else
        {
            DrawGameScene(game, screenWidth, screenHeight);

            if (game.state == GameState::Paused)
            {
                PauseMenuAction action = DrawPauseMenu(screenWidth, screenHeight);

                if (action == PauseMenuAction::Resume)
                {
                    game.state = GameState::Playing;
                }
                else if (action == PauseMenuAction::ExitToMenu)
                {
                    // Save world before exiting
                    if (!game.currentWorldName.empty())
                    {
                        SaveWorld(game, game.currentWorldName);
                    }
                    ResetWorld(game);
                    game.state = GameState::MainMenu;
                    selectedWorldIndex = -1;
                }
                else if (action == PauseMenuAction::ToggleFriends)
                {
                    game.friendsAllowed = !game.friendsAllowed;
                }
                else if (action == PauseMenuAction::Quit)
                {
                    game.running = false;
                }
            }
        }

        EndDrawing();
    }

    CloseWindow();
    return 0;
}
