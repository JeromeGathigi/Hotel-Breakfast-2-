import React, { useMemo } from 'react';
import type { MealServiceType } from '../types';
import { useDoorData } from './useDoorData';
import { firestoreDoorActions } from './firestoreActions';
import { DoorView } from './DoorView';

/** The door, connected to Firestore. All of its behaviour lives in DoorView and doorModel. */
export const DoorScreen: React.FC<{
  hotelId: string;
  today: string;
  service: MealServiceType;
  onServiceChange: (s: MealServiceType) => void;
  canManage: boolean;
  onOpenImport?: () => void;
}> = ({ hotelId, today, service, onServiceChange, canManage, onOpenImport }) => {
  const data = useDoorData(hotelId, today);
  const actions = useMemo(() => firestoreDoorActions(hotelId, today, data.tables), [hotelId, today, data.tables]);
  return (
    <DoorView
      data={data}
      service={service}
      onServiceChange={onServiceChange}
      actions={actions}
      canManage={canManage}
      onOpenImport={onOpenImport}
    />
  );
};
