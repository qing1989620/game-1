import {Box3,Ray,Vector3} from 'three';
/** Clip the authored follow ray against the nearest solid, independent of array order. */
export function followCameraPosition(target:Vector3,desired:Vector3,solids:readonly Box3[]):Vector3{
 const direction=desired.clone().sub(target),length=direction.length();if(length===0)return desired.clone();direction.normalize();
 const ray=new Ray(target,direction);let nearest=length;
 for(const box of solids){const hit=ray.intersectBox(box,new Vector3());if(hit)nearest=Math.min(nearest,hit.distanceTo(target));}
 return nearest<length?target.clone().addScaledVector(direction,Math.max(1.5,nearest-.5)):desired.clone();
}
