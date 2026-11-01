# Remote entries

This file is the shape an assistant uses to add rows to the private repo `nelzon-ai/macro-console-data`. The examples are fake. Do not put real meals, weights, measurements, photos, or tokens in this public app repo.

The phone is updated on its next sync. Sync merges; it does not replace one side with the other.

## Where to write

Preferred: a new file at `data/inbox/<any-name>.json` in the private repo.

Also accepted: new rows inside `data/latest.json`, using the same fields the backup already stores (`history`, `recipes`, `bodyComp`, `measurements`, `days`).

After a successful sync, an inbox file is copied to `data/inbox/processed/` and removed from `data/inbox/`. If the phone cannot read the private repo, it does not import the inbox and it does not change the logs on the phone.

Do not edit or delete anything under `data/history/`. Those files stay as they were.

## Inbox file

```json
{
  "id": "batch-example-1",
  "createdAt": "2026-01-15T08:00:00.000Z",
  "entries": []
}
```

`id` is the batch name. `createdAt` is used as the time on any entry that omits `updatedAt`. Unknown entry types are skipped. A file that is not JSON is left in the inbox.

Every entry that changes an existing row should include `updatedAt` set to the current time. The newer time wins. If neither side has a time, the phone's copy wins and the other copy is stored under `conflicts` in `data/latest.json`. A brand-new row does not need to win a conflict; it is added.

Give every food and recipe a stable `id` string you choose. The same `id` is the same row. Two foods with no `id`, the same name, and the same macros on the same day are treated as one row.

## Food

One logged item on a date. It shows in that day's log. The day's calorie total is raised when the foods add up to more than the saved total. A smaller total does not wipe a larger one unless that history row has a newer `updatedAt`.

```json
{
  "type": "food",
  "date": "2026-01-15",
  "id": "food-example-oats",
  "updatedAt": "2026-01-15T08:05:00.000Z",
  "name": "Example oats",
  "calories": 300,
  "protein": 12,
  "carbs": 50,
  "fat": 6,
  "fiber": 8
}
```

Optional `components` is a list of `{ "id", "name", "calories", "protein", "carbs", "fat", "fiber" }` when one meal is made of parts.

## Weigh-in

Sets the weight, in pounds, on that date. It does not replace other numbers on the day.

```json
{
  "type": "weighIn",
  "date": "2026-01-15",
  "updatedAt": "2026-01-15T07:30:00.000Z",
  "weight": 180
}
```

## Workout

Marks that date as trained. This is the day's workout flag (`done`, a short label, and minutes). Per-set weights logged in the workout screen stay on the phone; they are not part of this file.

```json
{
  "type": "workout",
  "date": "2026-01-15",
  "updatedAt": "2026-01-15T18:00:00.000Z",
  "done": true,
  "workoutType": "Example session",
  "duration": 30
}
```

## Measurement

Tape measurements in centimetres. Include only the fields you have. Omitted fields are left as they were.

```json
{
  "type": "measurement",
  "date": "2026-01-15",
  "updatedAt": "2026-01-15T07:40:00.000Z",
  "waist": 80,
  "chest": 100,
  "thigh": 55,
  "arm": 35,
  "neck": 38,
  "hips": 95
}
```

## Body composition

A scale or scan row for that date. `weight` here also fills the day's weigh-in when the day does not already have one. Any of the numeric fields may be omitted.

```json
{
  "type": "bodyComp",
  "date": "2026-01-15",
  "updatedAt": "2026-01-15T07:35:00.000Z",
  "weight": 180,
  "bodyFatPct": 20,
  "bmi": 24
}
```

Other numeric fields the app already stores are accepted with the same names: `muscleMass`, `heartRate`, `bmr`, `waterPct`, `bodyFatMass`, `leanBodyMass`, `boneMass`, `visceralFat`, `proteinPct`, `skeletalMuscleMass`, `subcutaneousFatPct`, `bodyAge`. `bodyType` is text.

## Recipe

A saved recipe, not a log for a specific day. Logging it onto a day is a separate `food` entry.

```json
{
  "type": "recipe",
  "id": "recipe-example-oats",
  "updatedAt": "2026-01-15T08:10:00.000Z",
  "name": "Example oats",
  "servings": 1,
  "calories": 300,
  "protein": 12,
  "carbs": 50,
  "fat": 6,
  "fiber": 8,
  "mealType": "Breakfast",
  "method": "Mix and heat.",
  "ingredients": [
    { "id": "ing-example-1", "name": "Example grain", "amount": "40", "unit": "g" }
  ]
}
```

## Delete

A delete does not remove the row forever with no record. The row leaves the live log, the tombstone is stored, and the removed copy is kept under `conflicts` in the private `data/latest.json`.

If the same row is edited again with an `updatedAt` later than `deletedAt`, the edit comes back. A row that is simply absent from one copy is not deleted.

```json
{
  "type": "delete",
  "collection": "foods",
  "date": "2026-01-15",
  "id": "food-example-oats",
  "deletedAt": "2026-01-15T09:00:00.000Z"
}
```

`collection` is one of:

| collection | identifies the row by |
| --- | --- |
| `foods` | `id`, and `date` when you know it |
| `recipes` | `id` |
| `history` | `date` |
| `bodyComp` | `date` |
| `measurements` | `date` |
| `workouts` | `date` (clears that day's workout flag) |
| `days` | `date` (clears that day's log detail) |

The same object can be placed in `data/latest.json` under `deleted` instead of an inbox entry:

```json
"deleted": [
  {
    "collection": "recipes",
    "id": "recipe-example-oats",
    "deletedAt": "2026-01-15T09:00:00.000Z"
  }
]
```

## Settings

Plan settings (targets, milestones, meals, supplements, workout split) normally stay as they are on the phone. To change them from the private repo, add a `settings` object on the inbox file. The keys are the same ones in [SETTINGS.md](../SETTINGS.md). This example uses placeholders only.

```json
"settings": {
  "weeklyWorkoutTarget": 3,
  "mealTypes": ["Breakfast", "Lunch", "Dinner", "Snacks"]
}
```

A `settings` object inside `data/latest.json` is not applied on its own. The phone's plan wins unless the change arrives through the inbox.

## Full inbox example

```json
{
  "id": "batch-example-1",
  "createdAt": "2026-01-15T08:00:00.000Z",
  "entries": [
    {
      "type": "food",
      "date": "2026-01-15",
      "id": "food-example-oats",
      "updatedAt": "2026-01-15T08:05:00.000Z",
      "name": "Example oats",
      "calories": 300,
      "protein": 12,
      "carbs": 50,
      "fat": 6,
      "fiber": 8
    },
    {
      "type": "weighIn",
      "date": "2026-01-15",
      "updatedAt": "2026-01-15T07:30:00.000Z",
      "weight": 180
    },
    {
      "type": "workout",
      "date": "2026-01-15",
      "updatedAt": "2026-01-15T18:00:00.000Z",
      "done": true,
      "workoutType": "Example session",
      "duration": 30
    },
    {
      "type": "measurement",
      "date": "2026-01-15",
      "updatedAt": "2026-01-15T07:40:00.000Z",
      "waist": 80
    },
    {
      "type": "bodyComp",
      "date": "2026-01-15",
      "updatedAt": "2026-01-15T07:35:00.000Z",
      "weight": 180,
      "bodyFatPct": 20
    },
    {
      "type": "recipe",
      "id": "recipe-example-oats",
      "updatedAt": "2026-01-15T08:10:00.000Z",
      "name": "Example oats",
      "calories": 300,
      "protein": 12,
      "carbs": 50,
      "fat": 6,
      "fiber": 8
    }
  ]
}
```
