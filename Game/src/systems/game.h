#pragma once
#include "raylib.h"
#include <vector>
#include <string>

enum class GameState
{
    MainMenu,
    WorldSelection,
    Playing,
    Paused
};

enum class MainMenuAction
{
    None,
    Play,
    CreateWorld,
    DeleteWorld,
    RenameWorld,
    ConfirmRenameWorld,
    Quit
};

struct WorldData
{
    std::string name;
    bool friendsAllowed = false;
};

enum class PauseMenuAction
{
    None,
    Resume,
    ExitToMenu,
    Quit,
    ToggleFriends
};

enum class ItemType
{
    Empty,
    Rock,
    Stick,
    Plant
};

inline const char* GetItemTypeName(ItemType type)
{
    switch (type)
    {
        case ItemType::Rock: return "Rock";
        case ItemType::Stick: return "Stick";
        case ItemType::Plant: return "Plant";
        case ItemType::Empty:
        default: return "None";
    }
}

struct ItemStack
{
    ItemType type = ItemType::Empty;
    int count = 0;
};

static const Vector3 PLAYER_HALF_SIZE = { 0.25f, 0.90f, 0.25f };

struct Inventory
{
    static constexpr int SLOT_COUNT = 9;
    static constexpr int HOTBAR_COUNT = 3;

    ItemStack slots[SLOT_COUNT];
    int selectedHotbar = 0;
    int selectedSlot = -1;
    bool storageOpen = false;
    bool showDropPreview = false;

    ItemStack heldItem;
    bool isHolding;
    bool selectedItemPanelOpen = false;
};

struct BoxCollider
{
    Vector3 center;
    Vector3 halfSize;
};

struct Item
{
    ItemType type;
    Vector3 position;
    Vector3 velocity;
    float mass;
    bool onGround;
};

struct Player
{
    Vector3 position;
    Vector3 velocity;
    float yaw;
    float pitch;
    bool onGround;
    float stamina = 100.0f;
    float maxStamina = 100.0f;
    float timeSinceSprintEnded = 0.0f; // Timer for regen delay
    float mass = 1.0f; // Player mass for physics
};

struct Game
{
    GameState state = GameState::MainMenu;
    bool running = true;
    bool cursorHidden = false;

    Player player{};
    Inventory inventory{};
    std::vector<BoxCollider> boulders;
    std::vector<Item> rocks;
    std::vector<Item> sticks;
    std::vector<Item> plants;
    RenderTexture2D target;
    std::string currentWorldName = "";
    bool friendsAllowed = false;
};

void InitGame(Game& game);
void ResetWorld(Game& game);
void ResetPlayer(Player& player);

void UpdateGameplay(Game& game, int screenWidth, int screenHeight);
void DrawGameScene(const Game& game, int screenWidth, int screenHeight);

// Terrain
float GetTerrainHeight(float x, float z);

// Unified drop/place: spawns the selected item where the player is looking.
void TryDropSelectedItem(Game& game);

MainMenuAction DrawMainMenu(int screenWidth, int screenHeight);
MainMenuAction DrawWorldSelection(int screenWidth, int screenHeight);
PauseMenuAction DrawPauseMenu(int screenWidth, int screenHeight);

// World system functions
std::vector<WorldData> GetWorldList();
bool SaveWorld(const Game& game, const std::string& worldName);
bool LoadWorld(Game& game, const std::string& worldName);
void GenerateWorld(Game& game);
bool IsValidWorldName(const std::string& worldName);
bool WorldExists(const std::string& worldName);
bool DeleteWorld(const std::string& worldName);
bool RenameWorld(const std::string& oldName, const std::string& newName);
