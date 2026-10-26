#pragma once
#include "raylib.h"

// ============================================================
//  XENOTERRA ENGINE — STYLESHEET
//  .h = CSS, .cpp = HTML. Edit positions and sizes here.
// ============================================================

namespace Styles
{
    // ---- Screen ----
    inline const int ScreenWidth  = 1920;
    inline const int ScreenHeight = 1080;

    // ---- Version ----
    inline const char* GameVersion = "15";

    // ---- Background ----
    inline const Color AppBg       = Color{ 245, 245, 250, 255 };

    // ---- Menu backdrop (gradient + planet) ----
    inline const Color MenuBgTop      = Color{ 16, 22, 46, 255 };
    inline const Color MenuBgBottom   = Color{ 38, 50, 90, 255 };
    inline const Color PlanetColor    = Color{ 26, 38, 78, 255 };
    inline const Color PlanetHighlight= Color{ 54, 78, 138, 255 };
    inline const Color PlanetRing     = Color{ 90, 120, 180, 90 };

    // ---- Main menu ----
    inline const int MainMenuTitleY       = 120;
    inline const int MainMenuTitleSize     = 52;
    inline const int MainMenuSubtitleY     = 190;
    inline const int MainMenuSubtitleSize  = 24;
    inline const int MainMenuPlayY         = 290;
    inline const int MainMenuQuitY         = 370;
    inline const int MainMenuBtnWidth      = 280;
    inline const int MainMenuBtnHeight     = 60;
    inline const int MainMenuHelpTextY     = 470;

    // ---- World selection layout ----
    inline const int  SelectionLeftX       = ScreenWidth / 2 - 420;
    inline const int  SelectionRightX      = ScreenWidth / 2 + 80;
    inline const int  PanelStartY          = 230;
    inline const int  PanelWidth           = 380;
    inline const int  PanelHeight          = 320;
    inline const int  PanelTitleYOffset    = 22;
    inline const int  PanelTitleSize       = 22;
    inline const int  WorldListTitleY      = PanelStartY + PanelTitleYOffset;
    inline const int  WorldListStartY      = PanelStartY + 50;   // below title
    inline const int  WorldListLeftPad     = 12;
    inline const int  WorldRowHeight       = 48;
    inline const int  WorldNameBtnWidth    = 275;
    inline const int  WorldOptBtnWidth     = 80;
    inline const int  WorldBtnHeight       = 40;
    inline const int  WorldListSpacing     = 10;

    inline const int  WorldListPanelRightX = SelectionRightX + WorldNameBtnWidth + WorldOptBtnWidth + 12;

    // ---- Options panel (appears on the right of world list) ----
    inline const int  OptionsOffsetX     = WorldListPanelRightX + 14;
    inline const int  OptionsWidth       = 260;
    inline const int  OptionsHeight      = 170;
    inline const int  OptionsTitleOffset = 14;
    inline const int  OptionsTitleSize   = 22;
    inline const int  OptionsBtnHeight   = 38;
    inline const int  OptionsBtnGap      = 12;
    inline const int  OptionsTopGap      = 45;
    inline const int  OptionsSidePad     = 14;

    // ---- Create world panel ----
    inline const int  CreatePanelX       = SelectionLeftX;
    inline const int  CreateNameInputY   = 300;
    inline const int  CreateInputWidth   = 340;
    inline const int  CreateInputHeight  = 48;
    inline const int  CreateInputPadding = 16;
    inline const int  CreateInputLeftPad = 20;
    inline const int  CreateFriendsY     = 380;
    inline const int  CreateBtnY         = 450;
    inline const int  CreateBtnWidth     = CreateInputWidth;
    inline const int  CreateBtnHeight    = 48;
    inline const int  CharCountY         = 365;
    inline const int  CharCountExtraBottomPad = 8;
    inline const int  RenameBoxPadX      = 10;
    inline const int  RenameBoxPadY      = 8;
    inline const int  RenameFontSize     = 16;

    // ---- Back button ----
    inline const int  BackBtnY      = ScreenHeight - 100;
    inline const int  BackBtnWidth  = 300;
    inline const int  BackBtnHeight = 40;

    // ---- Button: Default ----
    inline const Color  ButtonDefaultBg    = Color{ 210, 210, 210, 255 };
    inline const float  ButtonBorderWidth  = 3.0f;
    inline const float  ButtonFontSize     = 28;
    inline const Color  ButtonTextColor    = BLACK;

    // ---- Button: hover state ----
    inline const float  ButtonHoverBgDarken = 0.5f;
    inline const float  ButtonBorderDarken  = 0.5f;

    // ---- Button: custom / special ----
    inline const Color  ButtonFriendsToggleBg = Color{ 200, 240, 200, 255 };

    // ---- Stamina bar ----
    inline const int    StaminaBarWidth        = 200;
    inline const int    StaminaBarHeight       = 20;
    inline const int    StaminaBarPadding      = 20;
    inline const Color  StaminaBarBg           = Color{ 50, 50, 50, 200 };
    inline const Color  StaminaBarBorder       = BLACK;
    inline const Color  StaminaBarLabelColor   = BLACK;
    inline const int    StaminaBarLabelSize    = 16;

    // ---- Inventory slots ----
    inline const int    InventorySlotSize      = 54;
    inline const int    InventorySlotSpacing   = 8;
    inline const int    InventoryHotbarCount   = 3;
    inline const int    InventorySlotCount     = InventoryHotbarCount * 3;

    // ---- Inventory slot visuals ----
    inline const Color  SlotFill              = Color{ 225, 225, 225, 150 };
    inline const Color  SlotFillHighlight     = Color{ 240, 240, 255, 200 };
    inline const Color  SlotBorderNormal      = GRAY;
    inline const Color  SlotBorderHighlight   = BLUE;
    inline const float  SlotBorderWidthNormal = 2.0f;
    inline const float  SlotBorderWidthSelect = 4.0f;

    // ---- Item colors ----
    inline const Color  ItemRockColor  = Color{ 140, 140, 140, 255 };
    inline const Color  ItemStickColor = Color{ 139, 69, 19, 255 };

    // ---- Crosshair ----
    inline const Color  CrosshairColor      = WHITE;
    inline const int    CrosshairThickness   = 2;
    inline const int    CrosshairLength      = 10;

    // ---- 3D World colors ----
    inline const Color  BoulderColor     = Color{ 120, 110, 100, 255 };
    inline const Color  BoulderOutline   = Color{ 70, 64, 58, 255 };
    inline const Color  PlayerBodyColor  = Color{ 70, 120, 220, 255 };
    inline const Color  PlayerOutline    = BLUE;
    inline const Color  GroundColor      = GREEN;

    // ---- Text styles ----
    inline const Color  TitleColor        = DARKBLUE;
    inline const Color  SubtitleColor     = DARKGRAY;
    inline const int    SubtitleFontSize  = 24;
    inline const Color  BodyTextColor     = BLACK;
    inline const Color  HintTextColor     = GRAY;

    // ---- Panels & inputs ----
    inline const Color  PanelBg           = Color{ 240, 240, 240, 255 };
    inline const Color  PanelBorder       = DARKGRAY;
    inline const float  PanelBorderWidth  = 2.0f;
    inline const Color  SelectedItemPanelBg    = Color{ 240, 240, 255, 220 };
    inline const Color  SelectedItemPanelBorder = BLUE;
    inline const Color  TextInputNormalBg  = LIGHTGRAY;
    inline const Color  TextInputActiveBg  = WHITE;
    inline const Color  TextInputText      = BLACK;
    inline const Color  InputCursorColor   = BLACK;
    inline const Color  PauseOverlayColor  = Color{ 0, 0, 0, 120 };

    // ---- Error toast ----
    inline const Color  ErrorToastBg   = Color{ 255, 0, 0, 255 };
    inline const Color  ErrorToastText = WHITE;
    inline const int    ErrorToastFont = 30;
}
