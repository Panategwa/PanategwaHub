#include "stamina.h"
#include "raylib.h"

void DrawStaminaBar(const Player& player, int screenWidth, int screenHeight)
{
    const int barWidth = 200;
    const int barHeight = 20;
    const int padding = 20;
    const int x = padding;
    const int y = screenHeight - barHeight - padding;

    // Calculate stamina percentage
    float staminaPercent = player.stamina / player.maxStamina;
    
    // Background bar (gray)
    DrawRectangle(x, y, barWidth, barHeight, Color{ 50, 50, 50, 200 });
    
    // Stamina bar with smooth color gradient (green -> yellow -> red)
    Color staminaColor;
    if (staminaPercent > 0.5f)
    {
        // Green to yellow (0.5 to 1.0)
        float t = (staminaPercent - 0.5f) / 0.5f;
        staminaColor = Color{
            (unsigned char)(200 * (1.0f - t)),
            (unsigned char)(200),
            0,
            220
        };
    }
    else
    {
        // Yellow to red (0.0 to 0.5)
        float t = staminaPercent / 0.5f;
        staminaColor = Color{
            (unsigned char)(200),
            (unsigned char)(200 * t),
            0,
            220
        };
    }
    
    DrawRectangle(x, y, (int)(barWidth * staminaPercent), barHeight, staminaColor);
    
    // Border
    DrawRectangleLines(x, y, barWidth, barHeight, BLACK);
    
    // Label
    DrawText("Stamina", x, y - 20, 16, BLACK);
}
