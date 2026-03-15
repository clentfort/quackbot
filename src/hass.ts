import axios from 'axios';
import { env } from 'node:process';

const HASS_URL = env.HASS_URL;
const HASS_TOKEN = env.HASS_TOKEN;

export interface HassStatus {
  state: string;
  attributes: Record<string, any>;
}

export async function updateHassStatus(status: HassStatus) {
  if (!HASS_URL || !HASS_TOKEN) {
    return;
  }

  const url = `${HASS_URL}/api/states/sensor.quackbot`;
  try {
    await axios.post(
      url,
      {
        state: status.state,
        attributes: {
          ...status.attributes,
          friendly_name: 'Quackbot Status',
          icon: 'mdi:duck',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${HASS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error updating Home Assistant status:', error instanceof Error ? error.message : error);
  }
}

export async function sendHassNotification(message: string) {
  if (!HASS_URL || !HASS_TOKEN) {
    return;
  }

  const url = `${HASS_URL}/api/services/persistent_notification/create`;
  try {
    await axios.post(
      url,
      {
        message,
        title: 'Quackbot Alert',
      },
      {
        headers: {
          Authorization: `Bearer ${HASS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error sending Home Assistant notification:', error instanceof Error ? error.message : error);
  }
}
