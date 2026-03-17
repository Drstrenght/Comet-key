local HttpService = game:GetService("HttpService")

local KEY = "PUT_KEY_HERE"
local URL = "http://localhost:3000"

local hwid = game:GetService("RbxAnalyticsService"):GetClientId()

local auth = HttpService:JSONDecode(
    game:HttpPost(
        URL .. "/auth",
        HttpService:JSONEncode({
            key = KEY,
            hwid = hwid
        }),
        Enum.HttpContentType.ApplicationJson
    )
)

local token = auth.token

task.spawn(function()
    while true do
        task.wait(60)
        pcall(function()
            game:HttpPost(
                URL .. "/heartbeat",
                HttpService:JSONEncode({ token = token }),
                Enum.HttpContentType.ApplicationJson
            )
        end)
    end
end)

local scriptCode = game:HttpGet(URL .. "/script?token=" .. token)

local f = loadstring(scriptCode)
if f then f() end