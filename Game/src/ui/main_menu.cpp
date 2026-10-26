#include "../systems/game.h"
#include "ui.h"
#include "styles.h"
#include <string>

int selectedWorldIndex = -1;
static int optionsWorldIndex = -1;
char worldNameInput[17] = ""; // 16 chars + null terminator
char renameInput[17] = ""; // For renaming worlds
static bool isTyping = false;
static bool isRenaming = false;
static int cursorBlinkTimer = 0;
static bool showCursor = true;
bool friendsToggle = false;
static int keyRepeatTimer = 0;
static int lastKeyPressed = 0;
float errorTimer = 0.0f;
bool showError = false;
static int renamingWorldIndex = -1;
static bool renameInputActive = false;

MainMenuAction DrawMainMenu(int screenWidth, int screenHeight)
{
    // Backdrop: gradient sky + decorative planet
    DrawVGradient(Styles::MenuBgTop, Styles::MenuBgBottom, screenWidth, screenHeight);

    int planetR = 150;
    int planetX = screenWidth / 2;
    int planetY = 320;
    DrawCircle(planetX, planetY, planetR + 26, Styles::PlanetRing);
    DrawCircle(planetX, planetY, planetR, Styles::PlanetColor);
    DrawCircle(planetX - 52, planetY - 52, planetR - 34, Styles::PlanetHighlight);

    int titleX = screenWidth / 2 - MeasureText("Xenoterra", Styles::MainMenuTitleSize) / 2;
    DrawTextShadowed("Xenoterra", titleX, Styles::MainMenuTitleY, Styles::MainMenuTitleSize, Styles::TitleColor);

    std::string subtitle = std::string("Stranded on an alien planet, Version ") + Styles::GameVersion;
    DrawText(subtitle.c_str(),
        screenWidth / 2 - MeasureText(subtitle.c_str(), Styles::MainMenuSubtitleSize) / 2,
        Styles::MainMenuSubtitleY, Styles::MainMenuSubtitleSize, Styles::SubtitleColor);

    if (showError)
    {
        errorTimer -= GetFrameTime();
        if (errorTimer <= 0.0f) showError = false;
        else
        {
            int textWidth = MeasureText("2 worlds cannot have the same name", Styles::ErrorToastFont);
            DrawRectangle(
                screenWidth / 2 - textWidth / 2 - 20, 50,
                textWidth + 40, 50,
                Styles::ErrorToastBg
            );
            DrawText("2 worlds cannot have the same name",
                screenWidth / 2 - textWidth / 2, 65,
                Styles::ErrorToastFont, Styles::ErrorToastText);
        }
    }

    Rectangle playBtn = {
        screenWidth / 2.0f - Styles::MainMenuBtnWidth / 2.0f,
        (float)Styles::MainMenuPlayY,
        (float)Styles::MainMenuBtnWidth,
        (float)Styles::MainMenuBtnHeight
    };
    Rectangle quitBtn = {
        screenWidth / 2.0f - Styles::MainMenuBtnWidth / 2.0f,
        (float)Styles::MainMenuQuitY,
        (float)Styles::MainMenuBtnWidth,
        (float)Styles::MainMenuBtnHeight
    };

    if (DrawUiButton(playBtn, "Play")) return MainMenuAction::Play;
    if (DrawUiButton(quitBtn, "Quit")) return MainMenuAction::Quit;

    DrawText("WASD = move   SPACE = jump   ESC = pause",
        screenWidth / 2 - MeasureText("WASD = move   SPACE = jump   ESC = pause", 20) / 2,
        Styles::MainMenuHelpTextY, 20, Styles::HintTextColor);

    std::string ver = std::string("v") + Styles::GameVersion;
    DrawText(ver.c_str(),
        screenWidth - MeasureText(ver.c_str(), 20) - 24,
        screenHeight - 44, 20, Styles::HintTextColor);

    return MainMenuAction::None;
}

MainMenuAction DrawWorldSelection(int screenWidth, int screenHeight)
{
    DrawVGradient(Styles::MenuBgTop, Styles::MenuBgBottom, screenWidth, screenHeight);

    int selTitleX = screenWidth / 2 - MeasureText("Select World", Styles::MainMenuTitleSize) / 2;
    DrawTextShadowed("Select World", selTitleX, Styles::MainMenuTitleY, Styles::MainMenuTitleSize, Styles::TitleColor);

    if (showError)
    {
        errorTimer -= GetFrameTime();
        if (errorTimer <= 0.0f) showError = false;
        else
        {
            int textWidth = MeasureText("2 worlds cannot have the same name", Styles::ErrorToastFont);
            DrawRectangle(
                screenWidth / 2 - textWidth / 2 - 20, 50,
                textWidth + 40, 50,
                Styles::ErrorToastBg
            );
            DrawText("2 worlds cannot have the same name",
                screenWidth / 2 - textWidth / 2, 65,
                Styles::ErrorToastFont, Styles::ErrorToastText);
        }
    }

    std::vector<WorldData> worlds = GetWorldList();

    // ---- Left side: Create New World panel ----
    int leftX = Styles::SelectionLeftX;
    int createPanelX = leftX;
    int createPanelY = Styles::PanelStartY;

    DrawRectangle(
        createPanelX, createPanelY,
        Styles::PanelWidth, Styles::PanelHeight,
        Styles::PanelBg
    );
        DrawRectangleLinesEx(
            Rectangle{ (float)createPanelX, (float)createPanelY, (float)Styles::PanelWidth, (float)Styles::PanelHeight },
            Styles::PanelBorderWidth, Styles::PanelBorder);

    DrawText("Create New World",
        createPanelX + Styles::PanelTitleYOffset, createPanelY + Styles::PanelTitleYOffset,
        Styles::PanelTitleSize, Styles::SubtitleColor);

    Rectangle nameInputBox = {
        (float)(createPanelX + Styles::CreateInputLeftPad),
        (float)Styles::CreateNameInputY,
        (float)Styles::CreateInputWidth,
        (float)Styles::CreateInputHeight
    };
    DrawRectangleRec(nameInputBox, isTyping ? Styles::TextInputActiveBg : Styles::TextInputNormalBg);
    int textY = (int)nameInputBox.y + 14;
    DrawText(worldNameInput,
        (int)nameInputBox.x + Styles::CreateInputPadding,
        textY, 20, Styles::TextInputText);

    if (isTyping)
    {
        cursorBlinkTimer++;
        if (cursorBlinkTimer > 30) { showCursor = !showCursor; cursorBlinkTimer = 0; }
        if (showCursor)
        {
            int tw = MeasureText(worldNameInput, 20);
            DrawText("|",
                (int)nameInputBox.x + Styles::CreateInputPadding + tw,
                textY, 20, Styles::InputCursorColor);
        }
    }

    if (isTyping)
    {
        int ch = GetCharPressed();
        int key = GetKeyPressed();

        if (ch != 0)
        {
            int len = (int)strlen(worldNameInput);
            if (len < 16)
            {
                worldNameInput[len] = (char)ch;
                worldNameInput[len + 1] = '\0';
            }
        }
        else if (key != 0)
        {
            lastKeyPressed = key;
            keyRepeatTimer = 0;
            int len = (int)strlen(worldNameInput);
            if (key == KEY_BACKSPACE && len > 0) worldNameInput[len - 1] = '\0';
        }
        else if (IsKeyDown(lastKeyPressed))
        {
            keyRepeatTimer++;
            if (keyRepeatTimer > 30 && keyRepeatTimer % 5 == 0 && lastKeyPressed == KEY_BACKSPACE)
            {
                int len = (int)strlen(worldNameInput);
                if (len > 0) worldNameInput[len - 1] = '\0';
            }
        }
        else keyRepeatTimer = 0;
    }

    int charCount = (int)strlen(worldNameInput);
    char countText[32];
    sprintf(countText, "%d/16", charCount);
    DrawText(countText,
        (int)nameInputBox.x + Styles::CreateInputLeftPad,
        (int)nameInputBox.y + Styles::CreateInputHeight + Styles::CharCountExtraBottomPad, 16, Styles::HintTextColor);

    if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT))
    {
        Vector2 mp = GetMousePosition();
        isTyping = CheckCollisionPointRec(mp, nameInputBox);
    }

    Rectangle friendsToggleBox = {
        (float)(createPanelX + 20),
        (float)Styles::CreateFriendsY,
        (float)Styles::CreateBtnWidth,
        (float)Styles::CreateBtnHeight
    };
    if (DrawUiButton(friendsToggleBox, "Allow friends",
        friendsToggle ? Styles::ButtonFriendsToggleBg : Styles::ButtonDefaultBg))
    {
        friendsToggle = !friendsToggle;
    }

    Rectangle createBtn = {
        (float)(createPanelX + 20),
        (float)Styles::CreateBtnY,
        (float)Styles::CreateBtnWidth,
        (float)Styles::CreateBtnHeight
    };
    if (DrawUiButton(createBtn, "Create")) return MainMenuAction::CreateWorld;

    // ---- Right side: Load World panel ----
    int rightX = Styles::SelectionRightX;

    DrawRectangle(rightX, Styles::PanelStartY, Styles::PanelWidth, Styles::PanelHeight, Styles::PanelBg);
    DrawRectangleLinesEx(
        Rectangle{ (float)rightX, (float)Styles::PanelStartY, (float)Styles::PanelWidth, (float)Styles::PanelHeight },
        Styles::PanelBorderWidth, Styles::PanelBorder);

    DrawText("Load World",
        rightX + Styles::WorldListLeftPad, Styles::WorldListTitleY,
        Styles::PanelTitleSize, Styles::SubtitleColor);

    int startY = Styles::WorldListStartY;
    int listLeftX = rightX + Styles::WorldListLeftPad;
    int optionsMenuY = startY;
    Rectangle lastClickedOptionsBtn = { 0, 0, 0, 0 };

    for (size_t i = 0; i < worlds.size(); i++)
    {
        bool isEditing = (renamingWorldIndex == (int)i);

        Rectangle worldBtn = {
            (float)(listLeftX),
            (float)(startY + i * (Styles::WorldRowHeight + Styles::WorldListSpacing)),
            (float)Styles::WorldNameBtnWidth,
            (float)Styles::WorldBtnHeight
        };
        Rectangle optBtn = {
            (float)(listLeftX + Styles::WorldNameBtnWidth + 4),
            (float)(startY + i * (Styles::WorldRowHeight + Styles::WorldListSpacing)),
            (float)Styles::WorldOptBtnWidth,
            (float)Styles::WorldBtnHeight
        };

        if ((int)i == selectedWorldIndex && !isEditing)
            DrawRectangleRec(worldBtn, LIGHTGRAY);

        if (isEditing)
        {
            float ry = worldBtn.y;
            float rx = worldBtn.x;
            float rw = Styles::WorldNameBtnWidth + Styles::WorldOptBtnWidth + 4;

            Rectangle renameBox = { (float)listLeftX, ry, rw, (float)Styles::WorldBtnHeight - 2 };
            DrawRectangleRec(renameBox, Color{ 245, 250, 255, 255 });
            DrawRectangleLinesEx(renameBox, 2, BLUE);
            DrawText(renameInput, (int)rx + Styles::RenameBoxPadX, (int)ry + Styles::RenameBoxPadY, Styles::RenameFontSize, Styles::TextInputText);

            if (renameInputActive)
            {
                renamingWorldIndex = (int)i;
                cursorBlinkTimer++;
                if (cursorBlinkTimer > 30) { showCursor = !showCursor; cursorBlinkTimer = 0; }
                if (showCursor)
                {
                    int tw = MeasureText(renameInput, Styles::RenameFontSize);
                    DrawText("|", (int)rx + Styles::RenameBoxPadX + tw, (int)ry + Styles::RenameBoxPadY, Styles::RenameFontSize, Styles::InputCursorColor);
                }

                int rlen = (int)strlen(renameInput);
                char rcount[32];
                sprintf(rcount, "%d/16", rlen);
                DrawText(rcount,
                    (int)rx + Styles::RenameBoxPadX,
                    (int)(ry + Styles::WorldBtnHeight - 2 + 4),
                    14, Styles::HintTextColor);
            }

            if (renameInputActive)
            {
                int ch = GetCharPressed();
                int key = GetKeyPressed();

                if (ch != 0)
                {
                    int len = (int)strlen(renameInput);
                    if (len < 16)
                    {
                        renameInput[len] = (char)ch;
                        renameInput[len + 1] = '\0';
                    }
                }
                else if (key != 0)
                {
                    lastKeyPressed = key;
                    keyRepeatTimer = 0;
                    int len = (int)strlen(renameInput);
                    if (key == KEY_BACKSPACE && len > 0) renameInput[len - 1] = '\0';
                    else if (key == KEY_ENTER)
                    {
                        std::string newName(renameInput);
                        if (!newName.empty() && newName != worlds[i].name)
                        {
                            RenameWorld(worlds[i].name, newName);
                            worlds = GetWorldList();
                        }
                        renamingWorldIndex = -1;
                        renameInputActive = false;
                        renameInput[0] = '\0';
                    }
                    else if (key == KEY_ESCAPE)
                    {
                        renamingWorldIndex = -1;
                        renameInputActive = false;
                        renameInput[0] = '\0';
                    }
                }
                else if (IsKeyDown(lastKeyPressed))
                {
                    keyRepeatTimer++;
                    if (keyRepeatTimer > 30 && keyRepeatTimer % 5 == 0)
                    {
                        int len = (int)strlen(renameInput);
                        if (lastKeyPressed == KEY_BACKSPACE && len > 0) renameInput[len - 1] = '\0';
                        else if (lastKeyPressed == KEY_ESCAPE)
                        {
                            renamingWorldIndex = -1;
                            renameInputActive = false;
                            renameInput[0] = '\0';
                        }
                    }
                }
                else keyRepeatTimer = 0;
            }

            if (!renameInputActive && IsMouseButtonPressed(MOUSE_BUTTON_LEFT))
            {
                Vector2 mp = GetMousePosition();
                if (CheckCollisionPointRec(mp, worldBtn))
                {
                    renameInputActive = true;
                    strncpy(renameInput, worlds[i].name.c_str(), 16);
                    renameInput[16] = '\0';
                    lastKeyPressed = 0;
                }
            }

            if (renameInputActive && IsMouseButtonPressed(MOUSE_BUTTON_LEFT))
            {
                Vector2 mp = GetMousePosition();
                if (!CheckCollisionPointRec(mp, renameBox))
                {
                    if (renamingWorldIndex >= 0 && renamingWorldIndex < (int)worlds.size())
                    {
                        std::string newName(renameInput);
                        if (!newName.empty() && newName != worlds[renamingWorldIndex].name)
                        {
                            RenameWorld(worlds[renamingWorldIndex].name, newName);
                            worlds = GetWorldList();
                        }
                    }
                    renamingWorldIndex = -1;
                    renameInputActive = false;
                    renameInput[0] = '\0';
                }
            }
        }
        else
        {
            if (DrawUiButton(worldBtn, worlds[i].name.c_str()))
            {
                selectedWorldIndex = (int)i;
                return MainMenuAction::Play;
            }
        }

        if (!isEditing && DrawUiButton(optBtn, "..."))
        {
            optionsWorldIndex = (int)i;
            lastClickedOptionsBtn = optBtn;
            optionsMenuY = (int)worldBtn.y;
        }
    }

    // ---- Options panel ----
    if (optionsWorldIndex >= 0 && optionsWorldIndex < (int)worlds.size())
    {
        int optX = Styles::OptionsOffsetX;
        int optY = optionsMenuY;
        int optW = Styles::OptionsWidth;
        int optH = Styles::OptionsHeight;

        Rectangle optionsPanel = { (float)optX, (float)optY, (float)optW, (float)optH };
        DrawRectangleRec(optionsPanel, Styles::PanelBg);
        DrawRectangleLinesEx(optionsPanel, Styles::PanelBorderWidth, Styles::PanelBorder);
        DrawText("Options",
            optX + Styles::OptionsSidePad, optY + Styles::OptionsTitleOffset,
            Styles::OptionsTitleSize, Styles::TitleColor);

        int btnY = optY + Styles::OptionsTopGap;
        int btnW = optW - Styles::OptionsSidePad * 2;

        Rectangle friendsBtn = { (float)(optX + Styles::OptionsSidePad), (float)btnY, (float)btnW, (float)Styles::OptionsBtnHeight };
        if (DrawUiButton(friendsBtn, "Allow friends",
            worlds[optionsWorldIndex].friendsAllowed ? Styles::ButtonFriendsToggleBg : Styles::ButtonDefaultBg))
        {
            worlds[optionsWorldIndex].friendsAllowed = !worlds[optionsWorldIndex].friendsAllowed;
            Game tempGame;
            InitGame(tempGame);
            if (LoadWorld(tempGame, worlds[optionsWorldIndex].name))
            {
                tempGame.friendsAllowed = worlds[optionsWorldIndex].friendsAllowed;
                SaveWorld(tempGame, worlds[optionsWorldIndex].name);
            }
        }

        btnY += Styles::OptionsBtnHeight + Styles::OptionsBtnGap;

        float halfW = (btnW - Styles::OptionsBtnGap) / 2.0f;

        Rectangle renameBtn = { (float)(optX + 12), (float)btnY, halfW, (float)Styles::OptionsBtnHeight };
        if (DrawUiButton(renameBtn, "Rename"))
        {
            renamingWorldIndex = optionsWorldIndex;
            renameInputActive = true;
            strncpy(renameInput, worlds[optionsWorldIndex].name.c_str(), 16);
            renameInput[16] = '\0';
            lastKeyPressed = 0;
            optionsWorldIndex = -1;
        }

        Rectangle deleteBtn = { (float)(optX + 12 + halfW + Styles::OptionsBtnGap), (float)btnY, halfW, (float)Styles::OptionsBtnHeight };
        if (DrawUiButton(deleteBtn, "Delete"))
        {
            selectedWorldIndex = optionsWorldIndex;
            optionsWorldIndex = -1;
            return MainMenuAction::DeleteWorld;
        }

        if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT))
        {
            Vector2 mp = GetMousePosition();
            if (!CheckCollisionPointRec(mp, optionsPanel) &&
                !CheckCollisionPointRec(mp, friendsBtn) &&
                !CheckCollisionPointRec(mp, renameBtn) &&
                !CheckCollisionPointRec(mp, deleteBtn) &&
                !CheckCollisionPointRec(mp, lastClickedOptionsBtn))
            {
                optionsWorldIndex = -1;
                renamingWorldIndex = -1;
                renameInputActive = false;
                renameInput[0] = '\0';
            }
        }
    }

    Rectangle backBtn = {
        (float)(leftX),
        (float)Styles::BackBtnY,
        (float)Styles::BackBtnWidth,
        (float)Styles::BackBtnHeight
    };
    if (DrawUiButton(backBtn, "Back")) return MainMenuAction::Quit;

    return MainMenuAction::None;
}
