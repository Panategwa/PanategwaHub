#pragma once
#include "game.h"
#include <vector>

void UpdatePlayerMovement(Player& player, const std::vector<BoxCollider>& boxes, std::vector<Item>& rocks, std::vector<Item>& sticks, const std::vector<Item>& plants, bool lockCamera = false);