#include "texture.h"
#include "raylib.h"
#include <string>

static Texture2D g_grassTex = {0};
static bool g_grassLoaded = false;

static Texture2D LoadGrassTextureSafe()
{
    Texture2D tex = { 0 };

    const char* paths[] = {
        "src\\textures\\grass_texture.png",
        "..\\src\\textures\\grass_texture.png",
        "..\\..\\src\\textures\\grass_texture.png",
        "..\\..\\..\\src\\textures\\grass_texture.png",
        "C:\\Users\\user\\Desktop\\XenoTerraEngine\\src\\textures\\grass_texture.png"
    };

    for (const char* path : paths)
    {
        tex = LoadTexture(path);
        if (tex.id != 0)
        {
            TraceLog(LOG_INFO, "TEXTURE: loaded '%s' id=%u %dx%d format=%d",
                     path, tex.id, tex.width, tex.height, tex.format);
            return tex;
        }
    }

    TraceLog(LOG_WARNING, "TEXTURE: grass not found, using fallback");
    Image img = GenImageColor(64, 64, Color{40, 150, 40, 255});
    tex = LoadTextureFromImage(img);
    UnloadImage(img);
    return tex;
}

Texture2D Texture_LoadGrassSafe()
{
    return LoadGrassTextureSafe();
}

void Texture_EnsureGrassLoaded()
{
    if (g_grassLoaded) return;
    g_grassTex = LoadGrassTextureSafe();
    SetTextureFilter(g_grassTex, TEXTURE_FILTER_POINT);
    SetTextureWrap(g_grassTex, TEXTURE_WRAP_REPEAT);
    TraceLog(LOG_INFO, "TEXTURE: final grass id=%u %dx%d format=%d",
             g_grassTex.id, g_grassTex.width, g_grassTex.height, g_grassTex.format);
    g_grassLoaded = true;
}

Texture2D Texture_GetGrass()
{
    if (!g_grassLoaded) Texture_EnsureGrassLoaded();
    return g_grassTex;
}
