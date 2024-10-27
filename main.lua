package.path = debug.getinfo(1, "S").source:match[[^@?(.*[\/])[^\/]-$]] .."?.lua;".. package.path

local infile
local outfile
local offset = 0
local getStateNext = true

-- Required by luabot binding.
function OnInit()
  SendChat("/name [BOT]MetaLlama3_1")
  SendChat("Hello! I am lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF")
  infile = io.open("R://input.txt", "w")
  infile:close()
  infile = io.open("R://input.txt", "r")
  if not infile then
    SendChat("Could not open input file")
  else 
    SendChat("Opened input file")
  end
  outfile = io.open("R://output.txt", "w")
  if not infile then
    SendChat("Could not open output file")
  else 
    SendChat("Opened output file")
  end
  main = coroutine.create(MTLTest)
  live = true
end

-- Required. 100ms execution time limit. Use it wisely.
function OnTick()
  if live ~= false then
    live, err = coroutine.resume(main)
    if live == false then DebugLog(err) end
  end
end

function OnEvent (eventtype, sourceID, targetID, unittype, longitude, latitude)
  DebugLog("--- GOT AN EVENT ---")
end

function attemptPlace(longitude, latitude, typename)
  if typename ~= "RadarStation" and typename ~= "Silo" and typename ~= "AirBase" then
    DebugLog("Attempting to place structure, but typename provided is not supported!")
    return
  end
  local a = IsValidPlacementLocation(longitude, latitude, typename)
  if a == true then
    DebugLog("Valid placement (" .. typename .. "): " .. longitude .. " / " .. latitude)
    PlaceStructure(longitude, latitude, typename)
  else
    --DebugLog("Invalid placement")
    WhiteboardDraw(longitude-0.5, latitude-0.5, longitude+0.5, latitude+0.5)
    WhiteboardDraw(longitude-0.5, latitude+0.5, longitude+0.5, latitude-0.5)
  end
end

function attemptNuke(siloID, longitude, latitude)
  local id = getThingByID("Silo", siloID, true)
  if id ~= nil then
    SetState(id, 0)
    SetActionTarget(id, null, longitude, latitude)
    WhiteboardDraw(GetLongitude(id), GetLatitude(id), longitude, latitude)
  end
end

function getThingByID(type, idstr, mineOnly)
  local ud = {}
  GetAllUnitData(ud)
  for id, unit in pairs(ud) do
    if string.sub(tostring(id), 2, -2) == idstr then
      if mineOnly == false or (mineOnly == true and unit["team"] == GetOwnTeamID()) then
        if type == nil or (type ~= nil and unit["type"] == type) then
          return id
        end
      end
    end
  end
end

function GetGameState()
  local teamid = GetOwnTeamID()
  local cityids = GetCityIDs()
  local defcon = GetDefconLevel()
  local ud = {}
  local a, b
  GetAllUnitData(ud)

  outfile:write("\nDEFCON level: " .. defcon .. "\n\n")

  outfile:write("\nYour units and buildings currently on the map (id, typename, longitude, latitude):\n")
  for id, unit in pairs(ud) do
    if unit["team"] == teamid then
      outfile:write(string.sub(tostring(id), 2, -2) .. ", " .. tostring(unit["type"]) .. ", " .. tostring(unit["longitude"]) .. ", " .. tostring(unit["latitude"]) .. "\n")
    end
  end

  outfile:write("\nThese are the cities you must protect (longitude, latitude, population):\n")

  for _, id in ipairs(cityids) do
    if GetTeamID(id) == teamid then
      outfile:write(tostring(GetLongitude(id)) .. ", " .. tostring(GetLatitude(id)) .. ", " .. tostring(GetCityPopulation(id)) .. "\n")
    end
  end

  if GetDefconLevel() >= 4 then
    outfile:write("\nYou can still place:\n")
    if GetRemainingUnits("Silo") > 0 then
      outfile:write("Silo - " .. GetRemainingUnits("Silo") .. "\n")
    else
      outfile:write("NO Silo - do not try to place this!\n")
    end
    if GetRemainingUnits("RadarStation") > 0 then
      outfile:write("RadarStation - " .. GetRemainingUnits("RadarStation") .. "\n")
    else
      outfile:write("NO RadarStation - do not try to place this!\n")
    end
    if GetRemainingUnits("AirBase") > 0 then
      outfile:write("AirBase - " .. GetRemainingUnits("AirBase") .. "\n")
    else
      outfile:write("NO AirBase - do not try to place this!\n")
    end
  end

  if GetDefconLevel() <= 3 then
    outfile:write("\nThese are the cities you must DESTROY (longitude, latitude, population):\n")
    for _, id in ipairs(cityids) do
      if GetTeamID(id) ~= teamid then
        outfile:write(tostring(GetLongitude(id)) .. ", " .. tostring(GetLatitude(id)) .. ", " .. tostring(GetCityPopulation(id)) .. "\n")
      end
    end
  end

  if GetDefconLevel() <= 1 then
    outfile:write("\nYour silos with nukes (SiloID, nukecount):\n")
    for id, unit in pairs(ud) do
      if unit["team"] == teamid and unit["type"] == "Silo" and GetNukeCount(id) > 0 then
        outfile:write(string.sub(tostring(id), 2, -2) .. ", " --[[ .. tostring(unit["longitude"]) .. ", " .. tostring(unit["latitude"]) .. ", " --]] .. tostring(GetNukeCount(id)) .. "\n")
      end
    end
  end

  outfile:flush()
end

function MTLTest()
  while true do
    coroutine.yield()
    if GetGameTick() % 10 == 0 then

      -- write output
      if getStateNext == true then
        getStateNext = false
        GetGameState()
      end

      -- read input
      local file_size = infile:seek("end")
      --DebugLog("File size " .. file_size)
      if file_size < offset then
        DebugLog("File size got truncated, resetting!")
        offset = file_size
      end
      if file_size > offset then
        getStateNext = true
        infile:seek("set", offset)
        local content = infile:read(file_size - offset)
        offset = file_size
        for line in string.gmatch(content .. "\n", "(.-)\n") do
          local debuglog = string.match(line, "^DebugLog%(\"(.*)\"%)")
          if debuglog then
            DebugLog(debuglog)
          end

          local chat = string.match(line, "^SendChat%(\"(.*)\"%)")
          if chat then
            SendChat(chat)
          end

          local z, x, v = string.match(line, "^LaunchNukeFromSilo%(([0-9]*), ([0-9.-]*), ([0-9.-]*)%)")
          if z then
            attemptNuke(z, x, v)
          end

          local a, b, c = string.match(line, "^PlaceStructure%(([0-9.-]*), ([0-9.-]*), \"(.*)\"%)")
          if a then
            attemptPlace(a, b, c)
          end
        end
      end
    end
  end
end
