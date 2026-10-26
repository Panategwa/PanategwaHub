#include "inventory.h"
#include "../systems/game.h"
#include "../systems/inventory.h"
#include "ui.h"

extern Game* currentGame;

static void ClearSlot(ItemStack& slot)
{
    slot.type = ItemType::Empty;
    slot.count = 0;
}

static int GetSlotIndexAtMouse(const Vector2& mousePos, int screenWidth, int screenHeight, bool storageOpen)
{
    const int slotSize = 54;
    const int spacing = 8;
    int hotbarWidth = Inventory::HOTBAR_COUNT * slotSize + (Inventory::HOTBAR_COUNT - 1) * spacing;
    int hotbarX = screenWidth / 2 - hotbarWidth / 2;
    int hotbarY = screenHeight - slotSize - 24;
    
    // Hotbar slots (0-2)
    for (int i = 0; i < Inventory::HOTBAR_COUNT; i++)
    {
        Rectangle slotRect = {
            (float)(hotbarX + i * (slotSize + spacing)),
            (float)hotbarY,
            (float)slotSize,
            (float)slotSize
        };
        
        if (CheckCollisionPointRec(mousePos, slotRect))
        {
            return i;
        }
    }
    
    if (!storageOpen) return -1;
    
    // Storage slots (3-8)
    int storageX = hotbarX;
    int row1Y = hotbarY - slotSize - 20;
    int row2Y = row1Y - slotSize - 10;
    
    for (int i = 0; i < Inventory::HOTBAR_COUNT; i++)
    {
        Rectangle slotRect = {
            (float)(storageX + i * (slotSize + spacing)),
            (float)row2Y,
            (float)slotSize,
            (float)slotSize
        };
        
        if (CheckCollisionPointRec(mousePos, slotRect))
        {
            return 3 + i;
        }
    }
    
    for (int i = 0; i < Inventory::HOTBAR_COUNT; i++)
    {
        Rectangle slotRect = {
            (float)(storageX + i * (slotSize + spacing)),
            (float)row1Y,
            (float)slotSize,
            (float)slotSize
        };
        
        if (CheckCollisionPointRec(mousePos, slotRect))
        {
            return 6 + i;
        }
    }
    
    return -1;
}

void UpdateInventoryInput(Inventory& inventory, int screenWidth, int screenHeight)
{
    static int dragOriginSlot = -1;

    if (IsKeyPressed(KEY_ONE))
    {
        if (inventory.selectedSlot == 0)
        {
            inventory.selectedSlot = -1;
        }
        else
        {
            inventory.selectedHotbar = 0;
            inventory.selectedSlot = -1;
        }
    }
    if (IsKeyPressed(KEY_TWO))
    {
        if (inventory.selectedSlot == 1)
        {
            inventory.selectedSlot = -1;
        }
        else
        {
            inventory.selectedHotbar = 1;
            inventory.selectedSlot = -1;
        }
    }
    if (IsKeyPressed(KEY_THREE))
    {
        if (inventory.selectedSlot == 2)
        {
            inventory.selectedSlot = -1;
        }
        else
        {
            inventory.selectedHotbar = 2;
            inventory.selectedSlot = -1;
        }
    }

    if (IsMouseButtonPressed(MOUSE_BUTTON_MIDDLE))
    {
        inventory.storageOpen = !inventory.storageOpen;
    }

    Vector2 mousePos = GetMousePosition();

    // Pick up item on click - also select the clicked slot
    if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !inventory.isHolding)
    {
        int slotIdx = GetSlotIndexAtMouse(mousePos, screenWidth, screenHeight, inventory.storageOpen);
        if (slotIdx >= 0 && inventory.slots[slotIdx].type != ItemType::Empty)
        {
            inventory.selectedSlot = slotIdx;
            inventory.heldItem = inventory.slots[slotIdx];
            ClearSlot(inventory.slots[slotIdx]);
            inventory.isHolding = true;
            dragOriginSlot = slotIdx;
        }
    }

    // Drop item on release
    if (IsMouseButtonReleased(MOUSE_BUTTON_LEFT) && inventory.isHolding)
    {
        int dropIdx = GetSlotIndexAtMouse(mousePos, screenWidth, screenHeight, inventory.storageOpen);

        if (dropIdx >= 0 && dropIdx < Inventory::SLOT_COUNT)
        {
            if (inventory.slots[dropIdx].type == ItemType::Empty)
            {
                inventory.slots[dropIdx] = inventory.heldItem;
            }
            else
            {
                // Preserve both items when moving onto an occupied slot.
                ItemStack destinationItem = inventory.slots[dropIdx];
                inventory.slots[dropIdx] = inventory.heldItem;
                inventory.slots[dragOriginSlot] = destinationItem;
            }
        }
        else
        {
            // Return item to original slot if dropped outside
            inventory.slots[dragOriginSlot] = inventory.heldItem;
        }

        ClearSlot(inventory.heldItem);
        inventory.isHolding = false;
        // Keep selectedSlot on the dropped position
        if (dropIdx >= 0 && dropIdx < Inventory::SLOT_COUNT)
        {
            inventory.selectedSlot = dropIdx;
        }
        else
        {
            inventory.selectedSlot = -1;
        }
        dragOriginSlot = -1;
    }

}

static void DrawItemIcon(float centerX, float centerY, const ItemStack& slot)
{
    const int slotSize = 54;
    
    Rectangle rect = {
        centerX - slotSize / 2,
        centerY - slotSize / 2,
        (float)slotSize,
        (float)slotSize
    };
    
    if (slot.type != ItemType::Empty)
    {
        Color itemColor = Color{ 140, 140, 140, 255 };
        if (slot.type == ItemType::Stick)
        {
            itemColor = Color{ 139, 69, 19, 255 };
        }
        else if (slot.type == ItemType::Plant)
        {
            itemColor = Color{ 34, 139, 34, 255 };
        }
        DrawRectangle(
            (int)rect.x + 8,
            (int)rect.y + 8,
            (int)rect.width - 16,
            (int)rect.height - 16,
            itemColor
        );

        if (slot.type == ItemType::Rock)
        {
            DrawText("R", (int)rect.x + 18, (int)rect.y + 12, 24, BLACK);
        }
        else if (slot.type == ItemType::Stick)
        {
            DrawText("S", (int)rect.x + 18, (int)rect.y + 12, 24, BLACK);
        }
        else if (slot.type == ItemType::Plant)
        {
            DrawText("P", (int)rect.x + 18, (int)rect.y + 12, 24, BLACK);
        }
    }
}

static void DrawTransSlot(Rectangle rect, const ItemStack& slot, bool selected)
{
    Color fill = Color{ 225, 225, 225, 120 };
    Color outline = selected ? BLUE : GRAY;

    DrawRectangleRec(rect, fill);
    DrawRectangleLinesEx(rect, selected ? 4.0f : 2.0f, outline);
}

static void DrawSlot(Rectangle rect, const ItemStack& slot, bool selected, bool hovered)
{
    bool hasHighlight = selected || hovered;
    Color fill = hasHighlight ? Color{ 240, 240, 255, 200 } : Color{ 225, 225, 225, 150 };
    Color outline = hasHighlight ? BLUE : GRAY;

    DrawRectangleRec(rect, fill);
    DrawRectangleLinesEx(rect, hasHighlight ? 4.0f : 2.0f, outline);

    if (slot.type != ItemType::Empty)
    {
        Color itemColor = Color{ 140, 140, 140, 255 };
        if (slot.type == ItemType::Stick)
        {
            itemColor = Color{ 139, 69, 19, 255 };
        }
        else if (slot.type == ItemType::Plant)
        {
            itemColor = Color{ 34, 139, 34, 255 };
        }
        DrawRectangle(
            (int)rect.x + 8,
            (int)rect.y + 8,
            (int)rect.width - 16,
            (int)rect.height - 16,
            itemColor
        );

        if (slot.type == ItemType::Rock)
        {
            DrawText("R", (int)rect.x + 18, (int)rect.y + 12, 24, BLACK);
        }
        else if (slot.type == ItemType::Stick)
        {
            DrawText("S", (int)rect.x + 18, (int)rect.y + 12, 24, BLACK);
        }
        else if (slot.type == ItemType::Plant)
        {
            DrawText("P", (int)rect.x + 18, (int)rect.y + 12, 24, BLACK);
        }
    }
}

void DrawInventoryUI(const Inventory& inventory, int screenWidth, int screenHeight)
{
    const int slotSize = 54;
    const int spacing = 8;
    const int hotbarCount = 3;

    int hotbarWidth = hotbarCount * slotSize + (hotbarCount - 1) * spacing;
    int hotbarX = screenWidth / 2 - hotbarWidth / 2;
    int hotbarY = screenHeight - slotSize - 24;

    Vector2 mousePos = GetMousePosition();
    int hoveredSlot = -1;
     
    // Determine hovered slot (for storage highlight)
    if (inventory.storageOpen)
    {
        int storageX = hotbarX;
        int row1Y = hotbarY - slotSize - 20;
        int row2Y = row1Y - slotSize - 10;
        
        for (int i = 0; i < hotbarCount; i++)
        {
            Rectangle slotRect = {
                (float)(storageX + i * (slotSize + spacing)),
                (float)row2Y,
                (float)slotSize,
                (float)slotSize
            };
            
            if (CheckCollisionPointRec(mousePos, slotRect))
            {
                hoveredSlot = 3 + i;
            }
        }
        
        for (int i = 0; i < hotbarCount; i++)
        {
            Rectangle slotRect = {
                (float)(storageX + i * (slotSize + spacing)),
                (float)row1Y,
                (float)slotSize,
                (float)slotSize
            };
            
            if (CheckCollisionPointRec(mousePos, slotRect))
            {
                hoveredSlot = 6 + i;
            }
        }
    }

    // Draw hotbar slots - highlight selectedSlot if set, otherwise selectedHotbar
    for (int i = 0; i < hotbarCount; i++)
    {
        Rectangle slotRect = {
            (float)(hotbarX + i * (slotSize + spacing)),
            (float)hotbarY,
            (float)slotSize,
            (float)slotSize
        };

        bool isSelected = (inventory.selectedSlot >= 0) ? (i == inventory.selectedSlot) : (i == inventory.selectedHotbar);
        DrawTransSlot(slotRect, inventory.slots[i], isSelected);
    }

    // Draw hotbar item icons on top of slot backgrounds
    for (int i = 0; i < hotbarCount; i++)
    {
        Rectangle slotRect = {
            (float)(hotbarX + i * (slotSize + spacing)),
            (float)hotbarY,
            (float)slotSize,
            (float)slotSize
        };

        // Skip drawing item that is being held
        if (!inventory.isHolding || inventory.selectedSlot != i)
        {
            DrawItemIcon(slotRect.x + slotSize/2, slotRect.y + slotSize/2, inventory.slots[i]);
        }
    }
    
    // Draw held item at mouse position (full opacity, drawn AFTER slot items so it appears on top)
    if (inventory.isHolding && inventory.heldItem.type != ItemType::Empty)
    {
        DrawItemIcon(mousePos.x, mousePos.y, inventory.heldItem);
    }

    if (!inventory.storageOpen)
    {
        return;
    }

    int storageX = hotbarX;
    int row1Y = hotbarY - slotSize - 20;
    int row2Y = row1Y - slotSize - 10;

    DrawText("Storage", screenWidth / 2 - MeasureText("Storage", 24) / 2, row2Y - 34, 24, DARKGRAY);

    // Storage row 2 (slots 3-5) - highlight selectedSlot if it's in this row
    for (int i = 0; i < hotbarCount; i++)
    {
        Rectangle slotRect = {
            (float)(storageX + i * (slotSize + spacing)),
            (float)row2Y,
            (float)slotSize,
            (float)slotSize
        };

        bool isHovered = (3 + i == hoveredSlot);
        bool isSelected = (3 + i == inventory.selectedSlot);
        DrawSlot(slotRect, inventory.slots[3 + i], isSelected, isHovered);
    }

    // Storage row 1 (slots 6-8) - highlight selectedSlot if it's in this row
    for (int i = 0; i < hotbarCount; i++)
    {
        Rectangle slotRect = {
            (float)(storageX + i * (slotSize + spacing)),
            (float)row1Y,
            (float)slotSize,
            (float)slotSize
        };

        bool isHovered = (6 + i == hoveredSlot);
        bool isSelected = (6 + i == inventory.selectedSlot);
        DrawSlot(slotRect, inventory.slots[6 + i], isSelected, isHovered);
    }
}
