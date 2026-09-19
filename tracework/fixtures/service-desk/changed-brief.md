# Certification requirement update

Fictional public example. Replaces the original customer brief.

Residents request appointments for household repairs. Each request contains the repair category, a preferred date, the address, and a contact method.
The coordinator assigns an available technician and confirms an appointment window.
Customers receive confirmation and a notification when the technician is on the way.
Technician availability must prevent overlapping assignments. A cancelled appointment releases the reserved time.
Keep an audit trail of appointment state changes and assignment decisions.

Electrical and gas repairs must be assigned to a technician with a current certification for that repair category. Validate certification at assignment time and record the certification used in the audit trail.
The scheduling API and assignment tests must cover expired, missing, and valid certifications.
