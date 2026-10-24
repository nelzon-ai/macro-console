# Plan settings

Targets, start stats, milestones, meal types, supplements, and the workout split are stored on the phone (IndexedDB). They are included in **Copy full backup**, in **Restore**, and in the private-repo sync file `data/latest.json`. They are not part of the public app.

A new install starts from generic daily placeholders, no milestones, no supplements, and one sample workout day. Food logs, weigh-ins, history, recipes, body scans, measurements, photos, exercise-weight logs, and the sync token already on a phone are left in place. If targets were saved before, those saved numbers are kept. Milestones, supplements, and a custom workout split only appear after you enter them or import them — older versions kept that plan in the app itself, so it is not copied onto the phone automatically.

**Import settings** (Settings → Plan) reads a JSON file and applies only the plan fields below. It does not replace food logs, history, or the sync token. Renaming a meal type in Settings and tapping **Save plan** updates recipes that used the old name. Importing a new meal-type list does not rename recipes; a recipe whose category is not in the list still shows under that saved category.

Do not commit this file’s filled-in copy, and do not put it in the public app repo.

## Shape

Any of these keys may be omitted. Unknown keys are ignored. `token` is ignored.

```json
{
  "targets": {
    "calories": 2000,
    "protein": 150,
    "carbs": 200,
    "fat": 70,
    "fiber": 30,
    "water": 2000,
    "steps": 8000,
    "startWeight": null,
    "startBodyFatPct": null,
    "goalWeight": null,
    "goalBodyFatPct": null
  },
  "milestones": [
    { "weight": 180, "bodyFat": 20, "waist": 80 }
  ],
  "mealTypes": ["Breakfast", "Lunch", "Dinner", "Snacks"],
  "supplementGroups": [
    {
      "key": "morning",
      "title": "Morning",
      "note": "With breakfast",
      "items": [
        {
          "id": "item-1",
          "name": "Vitamin",
          "dose": "1 tablet",
          "detail": "With food",
          "reminder": false,
          "asNeeded": false
        }
      ]
    }
  ],
  "supplementRules": ["Take with food."],
  "weeklyWorkoutTarget": 3,
  "workoutDays": [
    {
      "key": "dayA",
      "label": "Day A",
      "sub": "Full body",
      "mode": "circuit",
      "exercises": [
        {
          "icon": "squat",
          "name": "Squat",
          "cue": "Squat down and stand up.",
          "sets": "3×8-12",
          "per": "",
          "tag": "Legs",
          "startWeight": "",
          "rest": 90
        }
      ]
    }
  ]
}
```

`targets` daily numbers are calories, protein, carbs, fat, and fiber in grams, water in ml, and steps. Blank daily numbers fall back to the generic placeholders. Goal and start fields may be `null`.

`milestones` is a list of checkpoints. `weight` is pounds, `bodyFat` is a percent, `waist` is centimetres. Any of the three may be `null`. An empty list means no checkpoints.

`mealTypes` is the category list. An empty list is allowed; recipes still appear under whatever category they already have.

`supplementGroups[].items[].reminder` marks a line that is shown but not ticked. `asNeeded` marks an optional item. `supplementRules` is a list of short notes.

`workoutDays[].mode` is `"circuit"` or `"straight"`. `exercises[].sets` is text such as `3×8-12` (the × character). `icon` is one of: squat, hinge2leg, hinge1leg, lunge, overheadpress, rotatepress, curl, tricepext, lateralraise, row1arm, row2arm, reardeltfly, floorpress, fly, calf2leg, calf1leg, bridge, splitsquat, stepup, legraise, plank. `weeklyWorkoutTarget` is how many training days you want in a week.

The same keys are added to a full backup, next to `history`, `recipes`, `bodyComp`, `measurements`, and `today`.
