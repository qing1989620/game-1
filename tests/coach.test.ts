import { describe, expect, it } from 'vitest';
import { patchCoach, playCoach } from '../src/game/coach';

describe('Contextual coach names one next action from live state',()=>{
  describe('pointer dock',()=>{
    it('the opening chapter tells the player to walk and find MIRA',()=>{
      const step=playCoach({city:'dock',chapter:'meet',evidence:[]});
      expect(step).not.toBeNull();
      expect(step!.key).toContain('W');
      expect(step!.hint).toContain('MIRA');
    });
    it('scanning is required before editing: the coach switches Q -> E only after evidence exists',()=>{
      const before=playCoach({city:'dock',chapter:'reorder',evidence:[]})!;
      const after=playCoach({city:'dock',chapter:'reorder',evidence:['Q-01']})!;
      expect(before.key).toBe('Q');
      expect(before.label).toContain('扫描');
      expect(after.key).toBe('E');
      expect(after.label).toContain('打断点');
      expect(after.hint).toContain('证据');
    });
    it('the rail chapter follows the same evidence-before-edit order',()=>{
      expect(playCoach({city:'dock',chapter:'rail',evidence:['Q-01']})!.key).toBe('Q');
      expect(playCoach({city:'dock',chapter:'rail',evidence:['Q-01','DS-01']})!.key).toBe('E');
    });
    it('the boarding chapter points at the train, and a finished dock points at the next city',()=>{
      expect(playCoach({city:'dock',chapter:'board',evidence:['Q-01','DS-01']})!.key).toBe('E');
      const done=playCoach({city:'dock',chapter:'complete',evidence:['Q-01','DS-01']})!;
      expect(done.label).toContain('脉冲炉');
    });
  });

  describe('pulse forge',()=>{
    it('arrival points at K-13',()=>{
      const step=playCoach({city:'forge',phase:'arrival',evidence:[]})!;
      expect(step.key).toContain('W');
      expect(step.label).toContain('K-13');
    });
    it('the climate phase requires evidence before the power workbench',()=>{
      const before=playCoach({city:'forge',phase:'climate',evidence:[]})!;
      const after=playCoach({city:'forge',phase:'climate',evidence:['WF-01']})!;
      expect(before.key).toBe('Q');
      expect(after.key).toBe('E');
    });
    it('the carry phase follows the same order',()=>{
      expect(playCoach({city:'forge',phase:'carry',evidence:[]})!.key).toBe('Q');
      expect(playCoach({city:'forge',phase:'carry',evidence:['CO-01']})!.key).toBe('E');
    });
    it('the exit phase points at the lift',()=>{
      expect(playCoach({city:'forge',phase:'exit',evidence:[]})!.label).toContain('升降台');
    });
  });

  describe('threadfall',()=>{
    it('arrival points at IRIS',()=>{
      const step=playCoach({city:'thread',phase:'arrival',evidence:[]})!;
      expect(step.hint).toContain('IRIS');
    });
    it('each main case needs its own evidence before editing',()=>{
      const none=playCoach({city:'thread',phase:'locks',evidence:[]})!;
      expect(none.key).toBe('Q');
      const one=playCoach({city:'thread',phase:'locks',evidence:['OS-01']})!;
      expect(one.key).toBe('E');
      // the next phase asks for its own case, not the one already collected
      expect(playCoach({city:'thread',phase:'schedule',evidence:['OS-01']})!.key).toBe('Q');
    });
    it('the audit phase asks for the integrated regression once evidence is complete',()=>{
      const all=['OS-01','OS-02','OS-03','OS-04'];
      const step=playCoach({city:'thread',phase:'audit',evidence:all})!;
      expect(step.key).toBe('E');
      expect(step.label).toContain('回归');
    });
    it('the evacuation phase points at the train',()=>{
      expect(playCoach({city:'thread',phase:'evacuate',evidence:[]})!.label).toContain('疏散列车');
    });
  });

  describe('whiteout relay',()=>{
    it('arrival points at KESTREL',()=>{
      expect(playCoach({city:'snow',phase:'arrival',evidence:[],delivery:0})!.label).toContain('KESTREL');
    });
    it('the expedition phase teaches the brace key and counts the deliveries',()=>{
      const step=playCoach({city:'snow',phase:'expedition',evidence:[],delivery:1})!;
      expect(step.key).toBe('F');
      expect(step.label).toContain('2/3');
    });
    it('main relays need their own evidence, and the audit asks for the integrated run',()=>{
      expect(playCoach({city:'snow',phase:'wind',evidence:[]})!.key).toBe('Q');
      const all=['WF-02','NET-01','NET-02','NET-03','NET-04'];
      expect(playCoach({city:'snow',phase:'audit',evidence:all})!.label).toContain('回归');
    });
  });

  describe('archive dunes',()=>{
    it('arrival points at NOOR',()=>{
      expect(playCoach({city:'dune',phase:'arrival',evidence:[],completed:[]})!.label).toContain('NOOR');
    });
    it('each main incident asks for its own evidence, not the first unscanned one',()=>{
      // Sequential phases: after DB-01 is repaired the coach must ask for DB-02,
      // not keep pointing at a case that is already done.
      expect(playCoach({city:'dune',phase:'stock',evidence:[],completed:[],})!.key).toBe('Q');
      expect(playCoach({city:'dune',phase:'billing',evidence:['DB-01'],completed:['DB-01']})!.key).toBe('Q');
      expect(playCoach({city:'dune',phase:'billing',evidence:['DB-01','DB-02'],completed:['DB-01']})!.key).toBe('E');
    });
    it('the audit and the canary drill both happen at the duty desk',()=>{
      expect(playCoach({city:'dune',phase:'audit',evidence:[],completed:[]})!.key).toBe('E');
      expect(playCoach({city:'dune',phase:'rehearsal',evidence:[],completed:[]})!.hint).toContain('回滚');
    });
    it('the descent teaches the brace key',()=>{
      const step=playCoach({city:'dune',phase:'descent',evidence:[],completed:[]})!;
      expect(step.key).toBe('F');
      expect(step.label).toContain('16');
    });
  });

  it('workbench guidance states the concrete goal for each dock case',()=>{
    expect(patchCoach('Q-01').label).toContain('让旅客离开');
    expect(patchCoach('DS-01').label).toContain('B');
    expect(patchCoach('Q-01').key).toBe('R');
    expect(patchCoach('DS-01').key).toBe('R');
  });
});
