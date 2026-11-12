/** The four legal actions in a shift. All server requests must follow this transition table. */
export type ClockAction = 'clockIn'|'pauseStart'|'pauseEnd'|'clockOut';
export type ClockStatus = 'idle'|'working'|'paused'|'completed';
export function transition(status:ClockStatus,action:ClockAction):ClockStatus {
  const allowed:Record<ClockStatus,Partial<Record<ClockAction,ClockStatus>>>= {
    idle:{clockIn:'working'},
    working:{pauseStart:'paused',clockOut:'completed'},
    paused:{pauseEnd:'working'},
    completed:{}
  };
  const next=allowed[status][action];
  if(!next)throw new Error(`Transition interdite : ${status} → ${action}`);
  return next;
}
