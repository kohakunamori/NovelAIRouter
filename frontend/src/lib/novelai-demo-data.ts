import type { CharacterPromptState, CharacterTemplate, ImageModelOption, ImagePreset, PromptChunk, PromptChunkCategory, QuickstartSample } from "@/types/novelai"

export const defaultBasePrompt = ""

export const defaultUndesiredPrompt =
  "lowres, blurry, bad anatomy, extra fingers, extra limbs, watermark, logo, text, photo, realistic, deformed"

const defaultSampleCost = 0

const quickstartPromptMap: Record<string, string> = {
  "0038": "1girl, muscular female, faceless, tall female, long ponytail, white hair, large hat, silver dress, white gloves, glowing skin, glowing hair, dutch angle, wide shot, grand scale, ruins, sand castle, night sky, traditional media, painting (medium), painterly, location",
  "0112": "1gitl, year 2025, blue twintails, pink eyes, messy bangs, oversized sweater, pastel cardigan, star hairpin, sitting, hugging plushie, bunny plush, sleepy eyes, hair over eyes, long sleeves, lap sitting, striped socks, slipper sandals, shorts, pink shorts, relaxed pose, solo, soft lighting, cozy atmosphere, indoors, white background 1.2::flat color,no lineart , location, very aesthetic, masterpiece, no text",
  "0120": "2boys, outdoors, brick wall, blue sky, contrail, cowboy shot",
  "0031": "1girl, game cg, pink hair, medium hair, pink eyes, bright pupils, cyborg, bikini armor, medium breasts, breasts, mechanical wings, detached wings, holding sword, energy sword, determined, v-shaped eyebrows, incoming attack, attack trail, blurry foreground, motion blur, perspective, dynamic pose, running, above clouds, outdoors, visible air, battle, looking at viewer, three quarter view, location",
  "0049": "1girl, solo, year 2025, baseball jacket, mask, cap, watch, snow, white gloves, ruins, dutch angle, heavy breath, location",
  "0057": "1other, eyecatch, headless, object head, flaming head, toned male, black suit, black necktie, white gloves, hatching (texture), chromatic aberration, outdoors, town, night, reaching towards viewer, perspective, blurry foreground, greyscale with colored background, blue fire, cowboy shot, fisheye, distortion, three quarter view, from below, location",
  "0044": "1girl, school uniform, arms behind back, cherry blossoms, warm smile, lineart, pastel color, very short hair",
  "0047": "1girl, three quarter view, scenery, maid, cat ears, bowl cut, light blush, sitting, wooden chair, hands on lap, slouching, head down, happy, sleeping, open mouth, drooling, no lineart, watercolor (medium), pale color, floral background, cloudy sky, gazebo, disgustingly adorable, garden, location",
  "0002": "1girl, cloud, contrail, wind, looking afar, light blue eye, location",
  "0110": "1boy, 1.5::amazing quality::,1.5::masterpiece::, year 2025,anime, male focus, demon, devil, horns, armor, full armor, heavy armor, dark armor, spear, polearm, weapon, red moon, full moon, red sky, sunset, twilight, dramatic sky, clouds, silhouette, standing, solo, menacing, evil, dark fantasy, gothic, red theme, purple theme, glowing eyes, red eyes, cape, long coat, badass, intimidating, scenery, wide shot, digital art, illustration",
  "0078": "1girl, dutch angle, posing, figure skating, dress, figure location, skating rink, stage light, sparkle, masterpiece, no text,",
  "0073": "1boy, chibi only, green hair, hair between eyes, yellow eyes, happy facial, kawaii, smile, happy aura, running towards viewer, no text, masterpiece,",
  "0118": "1boy, boxing ring, indoors, punching, solo, looking at viewer, hatching (texture), action, motion lines, muscular, short hair, emphasis lines, beard stubble",
  "0060": "2girls, symmetrical docking, from above, color contrast, red dress, white dress, halter dress, long dress, bent knees, jumping, floating clothes, floating hair, blush, flat chest, dynamic pose, glowing hair, headpiece, galaxy, ripples, reflection, bloom, shiny skin, best quality, location",
  "0102": "1girl, solo, muscular female, sleeveless turtleneck, angry, veiny arms, yellow eyes, eyepatch, small breasts, black hair, long hair, braided ponytail, dark skin, black gloves, looking away, glowing eye, scar on cheek, sunflower field, upper body, from below, traditional media, color trace, production art, location",
  "0005": "1girl, overalls, holding plant pot, garden scene, messy hair, sunlight, soft tones, ink outline",
  "0070": "1girl, year 2024, cover page, -1::monocrome, flat color, simple background, text logo::, masterpiece, best quality, very aesthetic, absurdres, solo, nurse, latex gloves, very long hair, red eyes, red hair, black pantyhose, cardigan, large breasts, skinny, crossed legs, smile, photo background, hospital, indoors, sunlight, lens flare",
  "0037": "1girl, medium hair, blonde hair, bird on head, baby chick, spring theme, pink overalls, white shirt, smiling, freckles, warm lighting, grass field background, cute pose, looking at viewer, solo, upper body, location",
  "0096": "no humans, highly detailed, pastel theme, kawaii, flowers, cake slice, dark background, watercolor (medium), oil painting (medium), acrylic paint (medium), iridescent glitter surface, sparkle, no lineart, flat color, no text, best quality, very aesthetic, absurdres",
  "0066": "1girl, year 2024, official art, cover page, thin legs ::, -1.5::monocrome, flat color, simple background, text logo::, best quality, very aesthetic, solo, tareme, outdoors, photo background, sunlight, lens flare",
  "0097": "1other, cat adventurers, tail, big head, cute, green cloak, red hat, shield on back, solo, standing at edge, depth of field, -2:: minimalism, simple illustration ::, thick white outline, 5:: anime colorling, deformed :: looking ahead, from back, shield, cat motif, cat face, decorated shield, cute shield, custom shield, cat print, location",
  "0003": "1girl, pajamas, brown hair, messy hair, yawning, sitting on bed, early morning, pastel tones, soft blur",
  "0109": "1boy, 1.5::amazing quality::,1.5::masterpiece::, year 2025, solo, knight, armor, full armor, plate armor, sitting, sword, weapon, cape, red cape, helmet, medieval, fantasy, rocks, outdoors, sky, clouds, dramatic, melancholy, somber, weathered, battle-worn, resting, contemplative, red light, beam of light, artistic, painting, traditional media, textured, gritty, atmospheric, moody, warrior, crusader, templar, chainmail, metal armor, exhausted, battlefield, post-battle",
  "0010": "1girl, sailor uniform, waving hand, schoolyard, cloudy, dynamic, soft shadow, rough sketch, manga style",
  "0012": "1boy, masterpiece, best quality, dynamic angle, scar across eye, handsome, male focus, broad shoulders, smug, white hair, manly, long face, strong chin, long hair, silver hair, ponytail, parted bangs, red scabbard, samurai knight armor, red eyes, red armor, red headband, gold trim, skinny, tall male, young, dramatic sword pose, red cloudy sky, from below, monochrome, moon, very aesthetic, location, masterpiece, no text, -0.8::feet::, rating:general",
  "0014": "1boy, muscular male, afro, orange hair, blue eyes, dark skin, long coat, gray coat, sleeveless, black turtleneck, smirk, thumbs up, gold bracelet, jeans, cowboy shot, epic, forest, waterfall, faux traditional media, millipen (medium), oekaki, high contrast, emphasis lines, location",
  "0043": "1girl, blonde hair, punk jacket, posing, graffiti wall, vibrant color, bold, comic shading, hands in pockets,",
  "0015": "1boy, red eyes, cowboy shot, dynamic angle, petite, pumpkin head, cape, mushrooms, pond, moonlight, traditional media, pen (medium), limited palette, location",
  "0020": "1girl, black hair, short hair grey eyes, tareme, solo, blunt bangs, cardigan, bag, happy aura, oekaki, outdoors",
  "0087": "1girl, window, rain, location, looking outside, thinking, indoors, white lily, hair flower, night, city lights",
  "0103": "solo, no humans, octopus, sunglasses, chibi, disgustingly adorable, lifebuoy, sun hat, tidal wave, traditional media, calligraphy brush (medium), no lineart, flat color, motion blur, from side, location",
  "0114": "2girls, traditional media, millipen (medium), hatching (texture), forest, outdoors, year 2024, monochrome, english text, text., very aesthetic, masterpiece, no text, -0.8::feet::, rating:general Text: Stop that!",
  "0063": "1girl, wolf ears, fluffy wolf tail, simple shading, tan skin, yellow eyes, messy silver hair, hunting, serious expression, carrying spear, wild dress, forest background, dappled sunlight, fang necklace, stream,",
  "0013": "1boy, 1girl, couple, year 2025, school, looking at viewer, straight-on, matching outfits, shirt, princess carry, cowboy shot, -2::simple clothes, realistic::, location",
  "0111": "1boy, 1.5::amazing quality::,1.5::masterpiece::, year 2025, solo, armor, helmet, mask, cyborg ninja, black hair, spiky hair, holding sword, katana, weapon, action pose, dynamic angle, motion blur, speed lines, orange accents, white armor, black bodysuit, mechanical, futuristic, cyberpunk, sparks, particles, bokeh, depth of field, dramatic lighting, warm lighting, sunset, combat, battle, science fiction, detailed armor, mecha, ninja, warrior, glowing, energy blade",
  "0021": "1girl, cat girl, topknot, light blue hair, orange eyes, skinny, freckles, black skirt, tan, red tank top, bar, bored, feet out of frame, traditional media, pastel (medium), depth of field, location",
  "0061": "2girls, multiple girls, deformed, very big eyes, white pupils, colored lineart, painterly, soft style, pastel colors, year 2025, location",
  "0099": "no humans, river, water, stone, duck, reflection, location",
  "0116": "1boy, 1girl, location, -1::monochrome, flat color::, light particles, couple, three quarter view",
  "0018": "1girl, masterpiece, best quality, dynamic angle, close-up, long eyelashes, hair slicked back, greek dress, white dress, green eyes, white dress, gold neck piece, earrings, short curly bob, side braid, short hair, ash blonde hair, medium hair, swept bangs, mole under mouth, bob cut, greek goddess, golden collar, jewelry, muted flowers, hair focus, location",
  "0056": "1other, elemental (creature), chibi, orange and red patterned skin, translucent skin, made of fire, full body, disgustingly adorable, clenched hands, angry, anger vein, exploding fiery hair, volcano, blue sky, location, text, english text, speech bubble., very aesthetic, masterpiece, no text, -0.8::feet::, rating:general Text: I'M NOT CUTE!",
  "0115": "1girl, blackboard, board eraser, expert shading, best quality, indoors, english text, text. The text \"Tags are concise.\" is written on the blackboard., very aesthetic, masterpiece, no text, -0.8::feet::, rating:general Text: Tags are concise.",
  "0028": "1girl, eyecatch, aqua hair, short hair, closed eyes, smile, blush, happy tears, wiping tears, upper body, looking back, serafuku, outdoors, dusk, orange sky, cloud, outside border, from side, light particles, clenched teeth, wavy mouth, location",
  "0054": "1other, elemental (creature), chibi, blue patterned skin, translucent skin, made of water, full body, disgustingly adorable, underwater, waving, location",
  "0113": "2girls, traditional media, watercolor (medium), abstract background, multicolored background, pastel colors, year 2024",
  "0017": "1girl, masterpiece, best quality, dynamic angle, close-up, long eyelashes, grey gradient hair, silver hair, ahoge, medium updo, thick eyebrows, hair between eyes, ponytail, pink blush, grey eyes, pink eyeshadow, smug, pink lips, glossy lips, short hair, white hair, messy hair, medium hair, ponytail, makeup, pink makeup, dark blue top, high ponytail, puffy hair, hair focus, very aesthetic, location, masterpiece, library background, location",
  "0055": "1other, elemental (creature), chibi, brown skin, made of rock, full body, disgustingly adorable, crying, looking down, location",
  "0064": "1girl, classroom background, hand on hip, adjusting glasses, smile, nerd, glasses, speech bubble, location., very aesthetic, masterpiece, no text, -0.8::feet::, rating:general text: It's just that shrimple!",
  "0001": "1girl, bed, candles, bedroom, location",
  "0006": "1girl, knight armor, sword raised, fantasy castle, cloudy sky, detailed style, texture brush",
  "0004": "1girl, leather jacket, holding phone, walking, neon lights, cyberpunk, glow, flat, digital neon",
  "0105": "1girl, jitome, sidelocks, long bangs, blunt bangs,long sidelocks, twintails, very long hair, ahoge, hair ribbon, earring, green eyes, tan, blonde hair, purple ribbon, star earring, dark-skinned female, print skirt, leopard print, wrist scrunchie, clothes around waist, black thighhighs, v, peace sign, smug, solo, child, flat chest, blush, location",
  "0108": "1girl, 1.5::amazing quality::,1.5::masterpiece::, year 2025, solo, black hair, short hair, red jacket, black skirt, standing, pixel art, voxel art, 3d pixel art, lantern, glowing, warm light, flowers, yellow flowers, depth of field, bokeh, teal background, turquoise, atmospheric, cozy, nostalgic, fantasy, whimsical, miniature, detailed, steam, smoke, magical, night, evening, ambient lighting, dreamy, stylized, no text",
  "0008": "1girl, 1.2::year 2020, ::, 1.3::HDR::, masterpiece, short hair, white frilly dress, sitting by window, morning glories, lace curtains, soft sunlight, bare feet, purple eyes, looking at viewer, low angle, cinematic lighting, detailed background, flower accessory, pastel colors, location",
  "0098": "no humans, solo, frog, pompadour, leather jacket, from below, lily pad, log, cityscape, misty lake, traditional media, watercolor pencil (medium), location",
  "0019": "1girl, black dress, reaching out, candlelight, victorian room, gothic, shadows, textured paint, looking at viewer",
  "0034": "1girl, jitome, sidelocks, long bangs, blunt bangs, long sidelocks, twintails, very long hair, ahoge, hair ribbon, earring, green eyes, black hair, red ribbon, heart earring, camisole, white dress, smug, solo, child, flat chest, blush, location",
  "0065": "1girl, alice (alice in wonderland),sitting bace of tree, sleeping, watercolor (medium), white background, grass, sketch, light smile, location",
  "0050": "1girl, year 2025, ahoge, blue eyes, blush, eating, eyelashes, fox girl, fox tail, headband, long hair, looking at viewer, loungewear, navel, pizza slice, shirt, side-tie shirt, sidelocks, simple background, single off shoulder, upper body, location",
  "0117": "1boy, 1girl, stage, indoors, cowboy shot, side-by-side, musical note, eighth note, quarter note, musical staff",
  "0016": "1boy, short hair, purple hair, purple eyes, narrowed eyes, bright pupils, white gloves, military uniform, military hat, boots, evil grin, armchair, 1.2::figure four sitting::, from below, looking down, indoors, sparkle, diffraction spikes, glint, three quarter view, dutch angle, location",
  "0051": "1girl, year 2025, animal ears, black pants, black vest, closed eyes, closed mouth, holding instrument, holding violin, instrument, music, pants, playing instrument, shirt, tree, vest, violin, white shirt, location",
  "0042": "1girl, portrait, curly hair, blonde hair, cross-laced clothes, white dress, hand on own cheek, arm support, leaning back, against railing, blurry foreground, looking afar, ocean, seagull, cloudy sky, lens flare, shaded face, long eyelashes, light smile, straw hat, backlighting, wind, pink petals, best quality, location",
  "0083": "1boy, fantasy, 0.7::anime coloring::, 0.3::photorealistic::, ,perspective, dark, centaur, long hair, holding spear, solo, eyelashes, diamond in eyes, running, angry, dutch angle, wind, thunder, Falling leaves, wasteland, castle, battlefield, Broken swords and spears piercing the ground, the corpses of swordsmen, motion blur, masterpiece,",
  "0041": "1girl, portrait, brown hair, long hair, red eyes, bright pupils, one eye closed, white dress, medium breasts, hand to own mouth, :o, three quarter view, simple background, -2::location::,",
  "0007": "1girl, lying on flowers, dark kimono, red and black color scheme, empty eyes, petals, dramatic lighting, dutch angle, ornate details, soft shadows, floral bed, ribbon heels, dark fantasy, intricate outfit, spider lily, location",
  "0032": "1girl, pencil sketch, hand-drawn style, grayscale, forest path, scarf, autumn, holding leaf, minimal shading, soft sketch lines, childlike, simple joy, walking pose, nature, location",
  "0052": "1girl, year 2025,barefoot, blue shorts, brown eyes, brown hair, collarbone, full body, hair ribbon, indian style, looking at viewer, pink background, pink shirt, ribbon, shirt, short hair, short shorts, sitting, sleeveless, sleeveless shirt, solo, stretching, yellow ribbon, location",
  "0035": "1girl, lab coat, writing on whiteboard, glasses, classroom, thinking face, clean lines, digital sketch",
  "0033": "1girl, hoodie, looking down, rainy alley, puddles, reflective, thick lines, desaturated",
  "0039": "1girl, oil painting style, lying on clouds, dreamlike, fantasy, painterly, flowing hair, eyes closed, serene, dutch angle, celestial background, brushstroke texture, solo, soft light, location",
  "0025": "1girl, child, wolf, outdoors, park, flowers, leaf, animal, perspective, walking, location",
  "0030": "1girl, from behind, red hair, long hair, blue yukata, festival, outdoors, looking up, fireworks, cinematic lighting, absurdres, night, dutch angle, light particles,, location",
  "0027": "1girl, dog companion, pixel art style, park background, sunny day, retro style, old game aesthetic, walking pose, cute pixel expression, limited palette, soft colors, location",
  "0058": "2:: chibi ::, solo , android, robot, helmet, faceplate, digital face, o_o , sci-fi, glowing face, futuristic, visor, upper body, location",
  "0082": "1girl, pointy ears, short hair with long locks, messy hair, light brown hair, ahoge sharp eyes, bright pupils, green eyes, tareme, fang out, fair skin, holding food, orange (fruit), location, very aesthetic, masterpiece, no text",
  "0074": "background dataset, A calico cat sitting on a white pillow on a grassy lawn.",
  "0048": "1girl, yukata, peace sign, fireworks, night, sparkles, watercolor, painterly, smile",
  "0053": "1girl, year 2025, cowboy shot, simple background, mosaic, dithering, window (computing),glitch, shaded face, diamond-shaped pupils, heart hands, paper texture, chromatic aberration, no text, -3::realistic::, location",
  "0072": "1girl, best quality, firefly princess, castle background, dark, wing crown, dress flower, glowing, butterfly hair ornament, flowers, petals, artbook, muted colors, watercolor pencil (medium)\, red light, looking away, nose, location",
  "0104": "1girl, the pose, straight on, yellow eye, smile, pink hair, twintails, hair between eyes, casual fashion, location, masterpiece,",
  "0101": "1girl, {{pale skin}}, grey hair, curly hair, medium hair, tired eyes, sleepy, {bags under eyes}, grey eyes, black eye shadow, panda ears, beanie, hoodie, sleeves past fingers, panda print, location, very aesthetic, masterpiece, no text",
  "0085": "1boy, high quality, {{masterpiece, very aesthetic}}, {traditional media}, dynamic pose, dynamic angle, glitter, handsome, male focus, broad shoulders, [smug, painterly], year 2020, broad shoulders, exquisite clothes, abstract background, royalty, beautiful young man, scepter, young, location",
  "0062": "1girl, -1.5::monocrome, flat color, simple background, retro artstyle::, masterpiece, best quality, very aesthetic, absurdres, patterned background, solo, black hair, white hair, two-tone hair, twintails, brown eyes, flat chest, hair between eyes, jirai kei, pink shirt, black skirt, mouth mask, black mask, randoseru, selfie, outdoors, photo background, real world location, shinjuku (tokyo)",
}

const quickstartSampleIds = [
  "0038",
  "0112",
  "0120",
  "0031",
  "0049",
  "0057",
  "0044",
  "0047",
  "0002",
  "0110",
  "0078",
  "0073",
  "0118",
  "0060",
  "0102",
  "0005",
  "0070",
  "0037",
  "0096",
  "0066",
  "0097",
  "0003",
  "0109",
  "0010",
  "0012",
  "0014",
  "0043",
  "0015",
  "0020",
  "0087",
  "0103",
  "0114",
  "0063",
  "0013",
  "0111",
  "0021",
  "0061",
  "0099",
  "0116",
  "0018",
  "0056",
  "0115",
  "0028",
  "0054",
  "0113",
  "0017",
  "0055",
  "0064",
  "0001",
  "0006",
  "0004",
  "0105",
  "0108",
  "0008",
  "0098",
  "0019",
  "0034",
  "0065",
  "0050",
  "0117",
  "0016",
  "0051",
  "0042",
  "0083",
  "0041",
  "0007",
  "0032",
  "0052",
  "0035",
  "0033",
  "0039",
  "0025",
  "0030",
  "0027",
  "0058",
  "0082",
  "0074",
  "0048",
  "0053",
  "0072",
  "0104",
  "0101",
  "0085",
  "0062",
]

const localQuickstartFullImageIds = new Set([
  "0001",
  "0006",
  "0007",
  "0018",
  "0020",
  "0032",
  "0037",
  "0043",
  "0044",
  "0054",
  "0062",
  "0066",
  "0097",
  "0101",
  "0113",
])

const localQuickstartPreviewImageIds = new Set([
  "0001",
  "0006",
  "0007",
  "0008",
  "0014",
  "0018",
  "0020",
  "0021",
  "0032",
  "0034",
  "0037",
  "0043",
  "0044",
  "0050",
  "0053",
  "0054",
  "0062",
  "0066",
  "0070",
  "0072",
  "0078",
  "0085",
  "0097",
  "0099",
  "0101",
  "0113",
  "0116",
])

function getQuickstartImageSrc(id: string) {
  return localQuickstartFullImageIds.has(id) ? `/images/novelai/quickstart/${id}.webp` : `https://static.novelai.net/quickstart/${id}.webp`
}

function getQuickstartPreviewImageSrc(id: string) {
  return localQuickstartPreviewImageIds.has(id)
    ? `/images/novelai/quickstart/${id}_tiny.webp`
    : getQuickstartImageSrc(id)
}

export const quickstartSamples: QuickstartSample[] = quickstartSampleIds.map((id) => ({
  id,
  imageSrc: getQuickstartImageSrc(id),
  previewImageSrc: getQuickstartPreviewImageSrc(id),
  prompt: quickstartPromptMap[id],
  undesiredPrompt: defaultUndesiredPrompt,
  width: 832,
  height: 1216,
  cost: defaultSampleCost,
}))

const randomPromptSubjects = [
  "1girl",
  "1boy",
  "solo",
  "2girls",
  "androgynous character",
]

const randomPromptStyles = [
  "year 2025, masterpiece, best quality, very aesthetic",
  "anime illustration, detailed background, dramatic composition",
  "painterly composition, abstract color splashes, bright fashion",
  "soft paper grain, sketchbook aesthetic, line art influence",
  "cinematic framing, moody lighting, detailed anime art",
]

const randomPromptAppearance = [
  "long hair, twintails, yellow eyes, blush",
  "short hair, green eyes, soft smile",
  "curly hair, monochrome outfit, sharp jawline",
  "flowing hair, ribbon, expressive eyes, elegant pose",
  "hoodie, layered outfit, messy hair, relaxed expression",
]

const randomPromptOutfits = [
  "pink dress, white apron, petticoat, thighhighs",
  "school uniform, pleated skirt, bow, jacket",
  "fantasy armor, cape, gloves, boots",
  "streetwear, oversized hoodie, sneakers, backpack",
  "kimono, frills, ribbon, floral ornament",
]

const randomPromptScenes = [
  "bedroom, candles, lying, on back",
  "city street, neon reflections, night",
  "field, soft lighting, spring breeze",
  "stained glass interior, floating ribbons",
  "watercolor sky, dreamy background, sparkles",
]

const randomPromptFinish = [
  "depth_of_field, detailed textures, perfect rendering",
  "soft lighting, chromatic aberration, paper texture",
  "dynamic pose, clean skin, delicate highlights",
  "dramatic anime shading, glowing backdrop, scenic composition",
  "full color illustration, crisp linework, polished details",
]

function pickRandomPromptPart(values: string[], indexOffset = 0) {
  return values[Math.floor((Math.random() * values.length + indexOffset) % values.length)]
}

export function buildRandomPrompt() {
  return [
    pickRandomPromptPart(randomPromptSubjects),
    pickRandomPromptPart(randomPromptStyles, 1),
    pickRandomPromptPart(randomPromptAppearance, 2),
    pickRandomPromptPart(randomPromptOutfits, 3),
    pickRandomPromptPart(randomPromptScenes, 4),
    pickRandomPromptPart(randomPromptFinish, 5),
  ].join(", ")
}

export const imageModelOptions: ImageModelOption[] = [
  {
    id: "nai-diffusion-4-5-curated",
    group: "new",
    label: "NAI Diffusion V4.5 Curated",
    description: "A version of our newest model trained on a curated subset of images. Recommended for streaming.",
  },
  {
    id: "nai-diffusion-4-5-full",
    group: "new",
    label: "NAI Diffusion V4.5 Full",
    description: "The complete V4.5 model with broader coverage and more flexible prompt response.",
  },
  {
    id: "nai-diffusion-4-curated",
    group: "legacy",
    label: "NAI Diffusion V4 Curated",
    description: "A cleaner V4 variant with tighter character rendering and lighter prompt overhead.",
  },
  {
    id: "nai-diffusion-4-full",
    group: "legacy",
    label: "NAI Diffusion V4 Full",
    description: "The previous full V4 model, kept for compatibility with older prompting styles.",
  },
  {
    id: "nai-diffusion-anime-v3",
    group: "legacy",
    label: "NAI Diffusion Anime V3",
    description: "Legacy anime-oriented model preserved for older prompt and style workflows.",
  },
  {
    id: "nai-diffusion-furry-v3",
    group: "legacy",
    label: "NAI Diffusion Furry V3",
    description: "Legacy furry-oriented model preserved for compatibility with older workflows.",
  },
]

export function isNovelAIV3Model(modelId: string) {
  return modelId.endsWith("-v3")
}

export function isNovelAILegacyV4Model(modelId: string) {
  return modelId === "nai-diffusion-4-curated" || modelId === "nai-diffusion-4-full"
}

export function getNovelAIPromptTokenLimit(modelId: string) {
  return isNovelAIV3Model(modelId) ? 225 : 512
}

export function supportsNovelAICharacterPrompts(modelId: string) {
  return !isNovelAIV3Model(modelId)
}

export function supportsNovelAIPreciseReference(modelId: string) {
  return !isNovelAIV3Model(modelId) && !isNovelAILegacyV4Model(modelId)
}

export const imagePresets: ImagePreset[] = [
  { id: "normal-portrait", group: "NORMAL", label: "Normal Portrait", menuLabel: "Portrait", width: 832, height: 1216 },
  { id: "normal-landscape", group: "NORMAL", label: "Normal Landscape", menuLabel: "Landscape", width: 1216, height: 832 },
  { id: "normal-square", group: "NORMAL", label: "Normal Square", menuLabel: "Square", width: 1024, height: 1024 },
  { id: "large-portrait", group: "LARGE", label: "Large Portrait", menuLabel: "Portrait", width: 1024, height: 1536 },
  { id: "large-landscape", group: "LARGE", label: "Large Landscape", menuLabel: "Landscape", width: 1536, height: 1024 },
  { id: "large-square", group: "LARGE", label: "Large Square", menuLabel: "Square", width: 1472, height: 1472 },
  { id: "wallpaper-portrait", group: "WALLPAPER", label: "Wallpaper Portrait", menuLabel: "Portrait", width: 1088, height: 1920 },
  { id: "wallpaper-landscape", group: "WALLPAPER", label: "Wallpaper Landscape", menuLabel: "Landscape", width: 1920, height: 1088 },
  { id: "small-portrait", group: "SMALL", label: "Small Portrait", menuLabel: "Portrait", width: 512, height: 768 },
  { id: "small-landscape", group: "SMALL", label: "Small Landscape", menuLabel: "Landscape", width: 768, height: 512 },
  { id: "small-square", group: "SMALL", label: "Small Square", menuLabel: "Square", width: 640, height: 640 },
  { id: "custom", group: "CUSTOM", label: "Custom", menuLabel: "Custom", width: 832, height: 1216 },
]

export const samplerOptions = [
  "Euler Ancestral",
  "Euler",
  "DPM++ 2S Ancestral",
  "DPM++ 2M SDE",
  "DPM++ 2M",
  "DPM++ SDE",
]

export const noiseScheduleOptions = ["karras (recommended)", "exponential", "polyexponential"]

export const initialPromptChunkCategories: PromptChunkCategory[] = [
  {
    id: "chunk-category-style",
    name: "Style",
    color: "#5E348D",
  },
  {
    id: "chunk-category-lighting",
    name: "Lighting",
    color: "#568687",
  },
  {
    id: "chunk-category-background",
    name: "Background",
    color: "#6B7280",
  },
]

export const initialPromptChunks: PromptChunk[] = [
  {
    id: "chunk-quality-core",
    name: "Quality Core",
    content: "masterpiece, best quality, very aesthetic, detailed background",
    color: "#6B7280",
    categoryId: null,
  },
  {
    id: "chunk-anime-render",
    name: "Anime Render",
    content: "anime illustration, polished details, crisp linework, scenic composition",
    color: "#5E348D",
    categoryId: "chunk-category-style",
  },
  {
    id: "chunk-soft-light",
    name: "Soft Light",
    content: "soft lighting, glow, chromatic aberration, delicate highlights",
    color: "#568687",
    categoryId: "chunk-category-lighting",
  },
  {
    id: "chunk-city-night",
    name: "City Night",
    content: "city street, neon reflections, night, cinematic framing",
    color: "#6B7280",
    categoryId: "chunk-category-background",
  },
]

export const qualityTagPrefix = "very aesthetic, masterpiece, no text, -0.8::feet::, rating:general"

export const undesiredPresetOptions = ["Human Focus", "Light", "Heavy", "None"]

export const undesiredPresetMap: Record<string, string> = {
  None: "",
  Light: "blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page",
  "Human Focus": "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page",
  Heavy: "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page",
}

export const characterTemplates: CharacterTemplate[] = [
  {
    id: "female",
    label: "Female",
    prompt: "girl,",
    undesiredPrompt: "",
  },
  {
    id: "male",
    label: "Male",
    prompt: "boy,",
    undesiredPrompt: "",
  },
  {
    id: "other",
    label: "Other",
    prompt: "",
    undesiredPrompt: "",
  },
]

export const initialCharacterPrompts: CharacterPromptState[] = [
  {
    id: "character-1",
    name: "Character 1",
    type: "female",
    prompt: "girl,",
    undesiredPrompt: "",
    activeTab: "prompt",
    isExpanded: true,
    enabled: true,
    tokens: 1,
    positionMode: "ai_choice",
    positionCell: null,
  },
  {
    id: "character-2",
    name: "Character 2",
    type: "male",
    prompt: "boy,",
    undesiredPrompt: "",
    activeTab: "prompt",
    isExpanded: false,
    enabled: true,
    tokens: 1,
    positionMode: "ai_choice",
    positionCell: null,
  },
]
