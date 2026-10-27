# V MOTIV V2 — Dynamic Question Engine & Issue Categories

## 1. Overview
The **Dynamic Question Engine** replaces hardcoded intake questionnaires with server-configurable, versioned `ServiceIssueTemplate` models. It enables automotive advisors and engineers to adjust diagnosis questions, response types, validation rules, and safety alerts without requiring mobile app updates or releases.

---

## 2. 10 Symptom Categories

| Key | Title | Fixed Package | Package Price | Diagnostic Fee | Safety Critical |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `REGULAR_SERVICE` | Regular Maintenance Service | Yes | ₹4,999 | Included | No |
| `AC_SERVICE` | AC Service & Cooling Issue | Yes | ₹2,499 | Included | No |
| `BATTERY_STARTING` | Battery & Starting Trouble | No | N/A | ₹799 | No |
| `BRAKE_ISSUE` | Brakes & Stopping System | No | N/A | ₹799 | Yes (Brake failure advisory) |
| `TYRES_WHEELS` | Tyres, Wheels & Alignment | Yes | ₹1,499 | Included | No |
| `NOISE_VIBRATION` | Noise, Rattle & Vibration | No | N/A | ₹799 | No |
| `ENGINE_OVERHEATING` | Engine Warning & Overheating | No | N/A | ₹799 | Yes (Flashing CEL / Steam) |
| `ELECTRICAL_ISSUE` | Electrical, Lights & Electronics | No | N/A | ₹799 | No |
| `BODY_PAINT` | Bodywork, Denting & Paint | No | N/A | Free Estimate | No |
| `OTHER_PROBLEM` | Other Issue / General Diagnostics | No | N/A | ₹799 | Yes (Drivability check) |

---

## 3. Question Schema Specification

Each question inside `questionsJson` adheres to the following JSON specification:

```typescript
interface ServiceIssueQuestion {
  stableId: string;       // Immutable unique ID across template versions (e.g. 'q_brake_feel')
  label: string;          // Human-readable query (e.g. 'How does the brake pedal feel?')
  explanation?: string;   // Contextual helper note for novice car owners
  responseType:           // Field rendering control:
    | 'SINGLE_SELECT'     // Exclusive single choice from options
    | 'MULTI_SELECT'      // Multiple selection array
    | 'NUMBER'            // Numeric input (e.g. current odometer reading)
    | 'TEXT'              // Freeform paragraph notes
    | 'BOOLEAN';          // Yes/No toggle
  options?: string[];     // Array of selectable string values
  required: boolean;      // Form progression constraint
  isSafetyCritical?: boolean; // Triggers emergency advisory banner and sets emergencySafetyFlag = true
}
```

---

## 4. Safety-Critical Handling
When a customer answers a question flagged `isSafetyCritical` with an option indicating a severe safety hazard (e.g., `NO - Brakes feel dangerous`, `Flashing repeatedly (CRITICAL)`, `Steam or smoke visible`):
1. **In-App Immediate Advisory**: Displays prominent red safety alert advising customer not to drive on highways or public streets.
2. **Server-Side Safety Flag**: The backend detects these responses and sets `emergencySafetyFlag = true` on the `ServiceRequest` record.
3. **Queue Prioritization**: Operations and Service Advisors see these flagged jobs pinned to the top of the queue with safety warnings to prioritize flatbed towing over customer road driving.
