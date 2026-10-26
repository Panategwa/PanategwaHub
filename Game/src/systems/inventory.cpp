#include "inventory.h"

static int FindEmptySlot(const Inventory& inventory)
{
    for (int i = 0; i < Inventory::SLOT_COUNT; i++)
    {
        if (inventory.slots[i].type == ItemType::Empty)
        {
            return i;
        }
    }

    return -1;
}

void InitInventory(Inventory& inventory)
{
    for (int i = 0; i < Inventory::SLOT_COUNT; i++)
    {
        inventory.slots[i].type = ItemType::Empty;
        inventory.slots[i].count = 0;
    }

    inventory.heldItem.type = ItemType::Empty;
    inventory.heldItem.count = 0;
    inventory.isHolding = false;

    inventory.selectedHotbar = 0;
    inventory.storageOpen = false;
    inventory.selectedItemPanelOpen = false;
    inventory.selectedSlot = -1;
}

bool TryAddRock(Inventory& inventory, int amount)
{
    if (amount <= 0)
        return false;

    bool addedAny = false;
    while (amount > 0)
    {
        int emptyIndex = FindEmptySlot(inventory);
        if (emptyIndex >= 0)
        {
            inventory.slots[emptyIndex].type = ItemType::Rock;
            inventory.slots[emptyIndex].count = 1;
            addedAny = true;
            amount--;
        }
        else
        {
            break;
        }
    }
    return addedAny;
}

bool TryAddStick(Inventory& inventory, int amount)
{
    if (amount <= 0)
        return false;

    bool addedAny = false;
    while (amount > 0)
    {
        int emptyIndex = FindEmptySlot(inventory);
        if (emptyIndex >= 0)
        {
            inventory.slots[emptyIndex].type = ItemType::Stick;
            inventory.slots[emptyIndex].count = 1;
            addedAny = true;
            amount--;
        }
        else
        {
            break;
        }
    }
    return addedAny;
}

bool TryAddPlant(Inventory& inventory, int amount)
{
    if (amount <= 0)
        return false;

    bool addedAny = false;
    while (amount > 0)
    {
        int emptyIndex = FindEmptySlot(inventory);
        if (emptyIndex >= 0)
        {
            inventory.slots[emptyIndex].type = ItemType::Plant;
            inventory.slots[emptyIndex].count = 1;
            addedAny = true;
            amount--;
        }
        else
        {
            break;
        }
    }
    return addedAny;
}