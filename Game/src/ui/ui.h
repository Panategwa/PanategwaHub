#pragma once
#include "raylib.h"
#include "styles.h"

inline Color DarkenColor(Color color, float factor)
{
    return Color{
        (unsigned char)(color.r * factor),
        (unsigned char)(color.g * factor),
        (unsigned char)(color.b * factor),
        color.a
    };
}

inline Color GetOutlineColor(Color backgroundColor)
{
    return DarkenColor(backgroundColor, Styles::ButtonBorderDarken);
}

inline bool DrawUiButton(Rectangle rect, const char* text, Color backgroundColor)
{
    Vector2 mouse = GetMousePosition();
    bool hovered = CheckCollisionPointRec(mouse, rect);

    Color bg = hovered ? DarkenColor(backgroundColor, Styles::ButtonHoverBgDarken) : backgroundColor;
    Color outline = hovered ? DarkenColor(GetOutlineColor(backgroundColor), Styles::ButtonHoverBgDarken) : GetOutlineColor(backgroundColor);

    DrawRectangleRec(rect, bg);
    DrawRectangleLinesEx(rect, Styles::ButtonBorderWidth, outline);

    DrawText(
        text,
        (int)(rect.x + rect.width / 2 - MeasureText(text, Styles::ButtonFontSize) / 2),
        (int)(rect.y + rect.height / 2 - Styles::ButtonFontSize / 2 - 2),
        Styles::ButtonFontSize,
        Styles::ButtonTextColor
    );

    return hovered && IsMouseButtonPressed(MOUSE_BUTTON_LEFT);
}

inline bool DrawUiButton(Rectangle rect, const char* text)
{
    return DrawUiButton(rect, text, Styles::ButtonDefaultBg);
}

// Vertical gradient fill (top -> bottom), drawn in horizontal bands.
inline void DrawVGradient(Color top, Color bottom, int width, int height, int step = 2)
{
    int bands = height / step + 1;
    for (int i = 0; i < bands; i++)
    {
        float t = (float)i / (float)(bands - 1);
        Color c = {
            (unsigned char)(top.r + (bottom.r - top.r) * t),
            (unsigned char)(top.g + (bottom.g - top.g) * t),
            (unsigned char)(top.b + (bottom.b - top.b) * t),
            (unsigned char)(top.a + (bottom.a - top.a) * t)
        };
        DrawRectangle(0, i * step, width, step + 1, c);
    }
}

// Text with a soft drop shadow for depth.
inline void DrawTextShadowed(const char* text, int x, int y, int size, Color color, Color shadow = BLACK, int off = 3)
{
    DrawText(text, x + off, y + off, size, shadow);
    DrawText(text, x, y, size, color);
}