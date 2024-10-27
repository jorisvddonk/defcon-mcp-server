package.path = debug.getinfo(1, "S").source:match[[^@?(.*[\/])[^\/]-$]] .."?.lua;".. package.path

local infile
local outfile
local offset = 0
local getStateNext = true
local test = false

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

function PlaceFleetAngle(longitude, latitude, type, angle)
  -- angle goes from 1 to 6
  local dist = 2
  local a = ((math.pi * 2) / 6) * (angle - 1)
  local lat = latitude + (math.sin(a) * dist)
  local lon = longitude + (math.cos(a) * dist)
  PlaceFleet(lon, lat, type)
end

function attemptFleet(longitude, latitude, type1, type2, type3, type4, type5, type6)
  local a = IsValidPlacementLocation(longitude, latitude, "Sub")
  if a == true then
    DebugLog("Valid placement (Fleet): " .. longitude .. " / " .. latitude)
    local t1 = ensureIsShipType(type1)
    local t2 = ensureIsShipType(type2)
    local t3 = ensureIsShipType(type3)
    local t4 = ensureIsShipType(type4)
    local t5 = ensureIsShipType(type5)
    local t6 = ensureIsShipType(type6)
    if t1 then
      DebugLog("1 - " .. t1)
      PlaceFleetAngle(longitude, latitude, t1, 1)
    end
    if t2 then
      DebugLog("2 - " .. t2)
      PlaceFleetAngle(longitude, latitude, t2, 2)
    end
    if t3 then
      DebugLog("3 - " .. t3)
      PlaceFleetAngle(longitude, latitude, t3, 3)
    end
    if t4 then
      DebugLog("4 - " .. t4)
      PlaceFleetAngle(longitude, latitude, t4, 4)
    end
    if t5 then
      DebugLog("5 - " .. t5)
      PlaceFleetAngle(longitude, latitude, t5, 5)
    end
    if t6 then
      DebugLog("6 - " .. t6)
      PlaceFleetAngle(longitude, latitude, t6, 6)
    end
  else
    --DebugLog("Invalid placement")
    WhiteboardDraw(longitude-0.5, latitude, longitude+0.5, latitude)
    WhiteboardDraw(longitude, latitude+0.5, longitude, latitude-0.5)
  end
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

function attemptDefensiveSilo(siloID, longitude, latitude)
  local id = getThingByID("Silo", siloID, true)
  if id ~= nil then
    SetState(id, 1)
  end
end

function ensureIsShipType(type)
  if type == "Sub" or type == "Carrier" or type == "BattleShip" then
    DebugLog("Yep, it's good: " .. type)
    return type
  end
  return nil
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

    outfile:write("\nYour silos without any nukes (SiloID) - HINT, you may want to set these to defensive mode!:\n")
    for id, unit in pairs(ud) do
      if unit["team"] == teamid and unit["type"] == "Silo" and GetNukeCount(id) == 0 then
        outfile:write(string.sub(tostring(id), 2, -2) .. "\n")
      end
    end
  end

  outfile:flush()
end

function MTLTest()
  while true do
    coroutine.yield()
    if GetGameTick() % 10 == 0 then
      if test then
        attemptFleet(-150.0, 30.0, "Sub", "Sub", "Sub", "Sub", "Sub", "Sub")
        test = false
      end

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

          local d = string.match(line, "^StopLaunchingNukesFromSiloAndGoDefensive%(([0-9]*)%)")
          if d then
            attemptDefensiveSilo(d)
          end

          -- note: below command also allows non-quoted types, as that's a common LLM mistake.
          local a, b, c = string.match(line, "^PlaceStructure%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?%)")
          if a then
            attemptPlace(a, b, c)
          end

          -- note: below command also allows non-quoted types, as that's a common LLM mistake.
          local e, f, g, h, i, j, k, l = string.match(line, "^PlaceFleet%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?%)")
          if e then
            attemptFleet(e, f, g, h, i, j, k, l)
          end
          local e, f, g, h, i, j, k = string.match(line, "^PlaceFleet%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?%)")
          if e then
            attemptFleet(e, f, g, h, i, j, k)
          end
          local e, f, g, h, i, j = string.match(line, "^PlaceFleet%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?%)")
          if e then
            attemptFleet(e, f, g, h, i, j)
          end
          local e, f, g, h, i = string.match(line, "^PlaceFleet%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?%)")
          if e then
            attemptFleet(e, f, g, h, i)
          end
          local e, f, g, h = string.match(line, "^PlaceFleet%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?, \"?([a-zA-Z]*)\"?%)")
          if e then
            attemptFleet(e, f, g, h)
          end
          local e, f, g = string.match(line, "^PlaceFleet%(([0-9.-]*), ([0-9.-]*), \"?([a-zA-Z]*)\"?%)")
          if e then
            attemptFleet(e, f, g)
          end
        end
      end
    end
  end
end
