#include "selected_item.h"
#include "../systems/game.h"
#include "ui.h"

void UpdateSelectedItemInput(Inventory& inventory)
{
    // Selected item panel is always open when inventory is open, no toggle needed
}

void DrawSelectedItemPanel(const Inventory& inventory, int screenWidth, int screenHeight)
{
    if (!inventory.storageOpen)
        return;

    const int slotSize = 54;
    const int spacing = 8;
    const int hotbarCount = 3;

    int hotbarWidth = hotbarCount * slotSize + (hotbarCount - 1) * spacing;
    int hotbarX = screenWidth / 2 - hotbarWidth / 2;
    int hotbarY = screenHeight - slotSize - 24;

    // Use selectedSlot if valid, otherwise use selectedHotbar
    int displaySlotIdx = inventory.selectedSlot >= 0 ? inventory.selectedSlot : inventory.selectedHotbar;
    if (displaySlotIdx < 0 || displaySlotIdx >= Inventory::SLOT_COUNT)
        displaySlotIdx = 0;
    ItemType selectedItemType = inventory.slots[displaySlotIdx].type;
    const char* itemName = GetItemTypeName(selectedItemType);

    // Position to the right of the hotbar, larger panel, slightly higher than hotbar
    Rectangle panel = {
        (float)(hotbarX + hotbarWidth + 20),
        (float)(hotbarY - 80),
        250.0f,
        120.0f
    };

    DrawRectangleRec(panel, Color{ 240, 240, 255, 220 });
    DrawRectangleLinesEx(panel, 2.0f, BLUE);

    DrawText("Selected Item:", (int)panel.x + 15, (int)panel.y + 12, 20, DARKGRAY);
    DrawText(itemName, (int)panel.x + 20, (int)panel.y + 40, 24, BLACK);
    DrawText("Placeholder: Item description goes here", (int)panel.x + 20, (int)panel.y + 70, 16, GRAY);
    DrawText("with additional lore and details", (int)panel.x + 20, (int)panel.y + 90, 14, LIGHTGRAY);
}

void DrawHeldItemText(const Inventory& inventory, int screenWidth, int screenHeight)
{
    const int slotSize = 54;
    const int spacing = 8;
    const int hotbarCount = 3;

    int hotbarWidth = hotbarCount * slotSize + (hotbarCount - 1) * spacing;
    int hotbarX = screenWidth / 2 - hotbarWidth / 2;
    int hotbarY = screenHeight - slotSize - 24;

    // Draw currently held item name on left of hotbar (only when inventory is closed)
    if (!inventory.storageOpen)
    {
        int displaySlotIdx = inventory.selectedSlot >= 0 ? inventory.selectedSlot : inventory.selectedHotbar;
        if (displaySlotIdx >= 0 && displaySlotIdx < Inventory::HOTBAR_COUNT && inventory.slots[displaySlotIdx].type != ItemType::Empty)
        {
            const char* itemName = GetItemTypeName(inventory.slots[displaySlotIdx].type);
            DrawText(itemName, hotbarX - MeasureText(itemName, 24) - 15, hotbarY + 15, 24, BLACK);
        }
    }
}
