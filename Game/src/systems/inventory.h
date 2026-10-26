#pragma once
#include "game.h"

void InitInventory(Inventory& inventory);
bool TryAddRock(Inventory& inventory, int amount = 1);
bool TryAddStick(Inventory& inventory, int amount = 1);
bool TryAddPlant(Inventory& inventory, int amount = 1);