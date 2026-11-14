# Team status API idea

Date: 2026-11-13

Explore exposing Orchestra's current team state through a read-only API so an
OpenChamber panel can show the active roster, live session availability, and
assignment status.

Current constraints:

- Team assignments are stored through OpenCode plugin storage, which an
  OpenChamber extension cannot read directly.
- The documented OpenCode plugin API does not provide a standard way to add
  custom REST routes.
- OpenChamber extensions can run on web and desktop, but not currently on
  mobile. A local extension service runs with the user's permissions and needs
  a narrow security boundary.

Possible directions include a companion local service with a read-only
projection, or a supported host/API integration. Keep plugin storage as the
source of truth unless a deliberate storage change is approved. Decide between
polling and push updates, and define session scoping and authorization before
implementation.

This is an exploratory idea, not an approved implementation plan or an
architecture decision.
