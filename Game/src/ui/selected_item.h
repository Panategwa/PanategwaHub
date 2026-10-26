#pragma once
#include "../systems/game.h"

void UpdateSelectedItemInput(Inventory& inventory);
void DrawSelectedItemPanel(const Inventory& inventory, int screenWidth, int screenHeight);
void DrawHeldItemText(const Inventory& inventory, int screenWidth, int screenHeight);