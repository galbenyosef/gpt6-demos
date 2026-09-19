# Engineering constraints

Fictional public example.

The initial deployment serves one neighborhood repair office. Prefer a small local deployment and a modular monolith unless evidence supports a more complex architecture.
Store only the contact information needed for the appointment. Access to addresses and contact details must be limited to the coordinator and assigned technician.
Every appointment state change and technician assignment must leave an auditable record.
Appointment scheduling owns availability and assignments. Customer communication owns confirmation and arrival notifications.
