# Garmin Training API application package

Status: ready for owner review before external submission.

## Product profile

- Product: Runner
- Public website: https://adelbert56.github.io/runner/
- Source repository: https://github.com/adelbert56/runner
- Product stage: early-stage pilot for runners in Taiwan
- API requested: Garmin Connect Developer Program - Training API only

## Requested use case

Runner creates personalised running plans from a runner's goal, planned race date,
availability, recent volume, recovery status, and optional Garmin-derived coaching
context. After a runner explicitly connects their Garmin account, Runner intends to
publish structured running workouts and dated training plans to that runner's Garmin
Connect calendar. The runner then synchronises their compatible Garmin device using
the normal Garmin Connect experience.

Runner does not need a runner's Garmin password. The intended integration uses
Garmin OAuth 2.0 consent and only publishes workouts after the runner has requested
the action.

## Initial scope and safeguards

- Publish scope: running workouts and training-plan dates only.
- No activity, Health API, course, Women's Health, or device-control access is
  requested in the first integration.
- Runner will show the workout name, date, and step summary for review before any
  publish action.
- Runner will let the user disconnect Garmin and revoke future publishing.
- Garmin credentials and passwords will never be collected or stored by Runner.
- The current browser-only manual/ICS export is a transition path; it will not be
  represented as an official Garmin push integration.

## Technical implementation plan after approval

1. Add a backend service that stores only OAuth tokens required for the approved
   Garmin integration, encrypted at rest.
2. Convert Runner's existing warm-up, main-workout, recovery, repeat, and cool-down
   data into Garmin Training API workout steps.
3. Validate the step model before publish and reject plans that cannot be mapped
   safely or precisely.
4. Publish only to the authenticated user's Garmin Connect calendar and keep a
   local publish ledger for support and retry visibility.
5. Use a clear consent, disconnect, and error-recovery flow in the Runner UI.

## Information the owner must supply before submission

- Legal entity or individual business name to use in the application.
- Primary contact name and role.
- Support email address.
- Country/region of operation.
- A public privacy-policy URL that covers OAuth tokens and workout data.
- Expected initial pilot user/device count.

Do not invent these values. Garmin may use them to assess the application and
contact the applicant.

## Email draft

To: connect-support@developer.garmin.com

Subject: Garmin Connect Developer Program - Training API Access Request for Runner

```text
Hello Garmin Connect Developer Program Team,

I am requesting access to the Garmin Connect Developer Program, specifically the
Training API, for Runner: https://adelbert56.github.io/runner/

Runner is an early-stage personalised running-plan platform for runners in Taiwan.
After a user explicitly authorises Runner through OAuth 2.0, we intend to publish
structured running workouts and dated training plans to that user's Garmin Connect
calendar. The user will then synchronise their compatible Garmin device through the
normal Garmin Connect experience.

We are requesting the Training API only. We will not collect or store Garmin account
passwords. Workouts will be published only after explicit user action, and users will
be able to disconnect the integration.

Could you please advise on the application requirements and next steps for Training
API access?

Applicant: [LEGAL ENTITY OR INDIVIDUAL BUSINESS NAME]
Primary contact: [NAME AND ROLE]
Support email: [SUPPORT EMAIL]
Country/region: [COUNTRY OR REGION]
Privacy policy: [PUBLIC PRIVACY POLICY URL]
Expected initial pilot users/devices: [COUNT]

Best regards,
[NAME]
Runner
```

## Submission boundary

The owner must provide the bracketed information and make the final confirmation
immediately before the email or form is submitted. This package does not claim that
Garmin access has been granted.
