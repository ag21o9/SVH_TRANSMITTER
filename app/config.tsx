import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  ViewStyle,
  TextStyle,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { NativeModules } from 'react-native';

// Import TCP Socket
import TcpSocket from 'react-native-tcp-socket';

// Types
interface IpPortPair {
  id: string;
  ip: string;
  port: string;
}

interface DeviceConfig {
  backend: string;
  ipPortPairs: IpPortPair[];
  deviceImei: string;
  vendorId: string;
  vehicleNumber: string;
  networkProvider: 'Airtel' | 'Vodafone' | 'BSNL' | '';
  firmwareVersion: string;
  useGpsCoordinates: boolean;
  latitude: string;
  longitude: string;
}

// IpPortPair Component
interface IpPortPairProps {
  pair: IpPortPair;
  index: number;
  onIpChange: (id: string, ip: string) => void;
  onPortChange: (id: string, port: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

// Fix the IpPortPair Component
const IpPortPairComponent: React.FC<IpPortPairProps> = ({
  pair,
  index,
  onIpChange,
  onPortChange,
  onRemove,
  canRemove,
}) => {
  return (
    <View style={ipPortStyles.container}>
      <View style={ipPortStyles.header}>
        <Text style={ipPortStyles.title}>Server {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity 
            style={ipPortStyles.removeButton} 
            onPress={() => onRemove(pair.id)}
            activeOpacity={0.7}
          >
            <Icon name="delete" size={20} color="#FF5252" />
          </TouchableOpacity>
        )}
      </View>
      <View style={ipPortStyles.inputRow}>
        <View style={ipPortStyles.inputContainer}>
          <Text style={ipPortStyles.inputLabel}>IP Address</Text>
          <TextInput
            style={ipPortStyles.input}
            placeholder="192.168.1.1"
            value={pair.ip}
            onChangeText={(value) => onIpChange(pair.id, value)} // Fixed: Pass pair.id and value
            keyboardType="default" // Changed from "numeric" to "default" for IP addresses
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={ipPortStyles.inputContainer}>
          <Text style={ipPortStyles.inputLabel}>Port</Text>
          <TextInput
            style={ipPortStyles.input}
            placeholder="8080"
            value={pair.port}
            onChangeText={(value) => onPortChange(pair.id, value)} // Fixed: Pass pair.id and value
            keyboardType="numeric"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
    </View>
  );
};

// Add PVT Packet Generation Functions
function calculateChecksum(sentence: string): string {
  // XOR all characters after '$' and before '*'
  let checksum = 0;
  for (let i = 1; i < sentence.length; i++) {
    checksum ^= sentence.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

function buildPvtPacket(input: any, packetType: string = 'NR', alertId: string = '1'): string {
  const now = new Date();

  const pad = (num: number, size: number) => num.toString().padStart(size, '0');
  const dateStr = `${pad(now.getDate(), 2)}${pad(now.getMonth() + 1, 2)}${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;

  const latitude = input.latitude || '00.000000';
  const longitude = input.longitude || '00.000000';

  const fields = [
    '$PVT',
    input.vendorId || 'VNDR',
    input.firmwareVersion || 'FIRMWAREVER1.0',
    packetType,                   // NR, EPB, etc.
    alertId,                      // Alert ID
    'L',                          // Packet status: L = Live
    input.deviceImei,
    (input.vehicleNumber || '').replace(/[^A-Z0-9]/gi, '').padStart(16, '0'),
    '1',                          // GNSS Fix: 1 = fix
    dateStr,                      // DDMMYYYY
    timeStr,                      // HHMMSS
    latitude,
    'N',
    longitude,
    'E',
    '0',                          // Speed (km/h)
    '117.58',                     // Heading (degrees)
    '39',                         // No. of satellites
    '286.7',                      // Altitude (m)
    '0.42',                       // PDOP
    '0.43',                       // HDOP
    input.networkProvider || 'AIRTEL',
    '1',                          // Ignition
    '1',                          // Main Power
    '12.2',                       // Main Input Voltage
    '4.1',                        // Internal Battery Voltage
    '0',                          // Tamper
    'C',                          // Door status (Closed)
    '12',                         // GSM signal strength (0–31)
    '404',                        // MCC
    '53',                         // MNC
    '16C7',                       // LAC
    'E4C2',                       // Cell ID
    '2138', '700000', '29',       // NMR 1
    '2137', '700000', '21',       // NMR 2
    '2136', '700000', '21',       // NMR 3
    '968A', '70000', '19',        // NMR 4
    '0000', '0000', '00',         // Placeholder
    '0',                          // Analog Input
    '492894',                     // Frame number
    '00AC'                        // Placeholder checksum (will be replaced)
  ];

  const payloadWithoutChecksum = fields.join(',');
  const checksum = calculateChecksum(payloadWithoutChecksum);
  return `${payloadWithoutChecksum}*${checksum}`;
}

// Build Login Packet
function buildLoginPacket(input: any): string {
  const fields = [
    '$LGN',
    input.vendorId || 'VNDR',
    input.deviceImei,
    input.firmwareVersion || 'FIRMWAREVER1.0',
    'AIS140',
    input.latitude || '30.101455',
    input.longitude || '78.289948',
    'DDE3220E*'
  ];
  
  const payloadWithoutChecksum = fields.join(',');
  const checksum = calculateChecksum(payloadWithoutChecksum);
  return `${payloadWithoutChecksum}*${checksum}`;
}

// Real TCP Connection Manager
class TCPConnectionManager {
  private connections: Map<string, any> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  connectToServer(serverConfig: { ip: string; port: number; id: string }, deviceConfig: any) {
    const serverId = serverConfig.id;
    
    // Close existing connection if any
    this.disconnectFromServer(serverId);

    console.log(`🔄 Connecting to ${serverConfig.ip}:${serverConfig.port}`);

    try {
      const options = {
        port: serverConfig.port,
        host: serverConfig.ip,
        timeout: 15000,
        noDelay: true,
        keepAlive: true,
      };

      const client = TcpSocket.createConnection(options, () => {
        console.log(`✅ Connected to ${serverConfig.ip}:${serverConfig.port}`);
        
        // Send login packet immediately
        const loginPacket = buildLoginPacket(deviceConfig);
        client.write(loginPacket);
        console.log(`📤 Login sent to ${serverConfig.ip}:${serverConfig.port}`);
        console.log(`📦 Login Packet: ${loginPacket}`);

        // Send PVT packet every 5 seconds
        const interval = setInterval(() => {
          if (!client.destroyed) {
            const pvtPacket = buildPvtPacket(deviceConfig);
            client.write(pvtPacket);
            console.log(`📤 PVT sent to ${serverConfig.ip}:${serverConfig.port}`);
            console.log(`📦 PVT Packet: ${pvtPacket}`);
          }
        }, 5000);

        this.intervals.set(serverId, interval);
      });

      // Handle incoming data from server
      client.on('data', (data) => {
        const receivedData = data.toString();
        console.log(`📥 Received from ${serverConfig.ip}:${serverConfig.port}:`);
        console.log(`📨 Data: ${receivedData}`);
        console.log(`📊 Raw bytes: ${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        
        // Handle specific server responses
        if (receivedData.includes('LOGIN')) {
          console.log(`🔐 Login response received`);
        } else if (receivedData.includes('ACK')) {
          console.log(`✅ Acknowledgment received`);
        }
      });

      // Handle connection close
      client.on('close', (hadError) => {
        console.log(`❌ Connection closed: ${serverConfig.ip}:${serverConfig.port} (Error: ${hadError})`);
        this.cleanup(serverId);
        this.connections.delete(serverId);
      });

      // Handle errors
      client.on('error', (err) => {
        console.error(`🚨 Error on ${serverConfig.ip}:${serverConfig.port}: ${err.message}`);
        console.error(`🚨 Error details:`, err);
        this.cleanup(serverId);
        this.connections.delete(serverId);
      });

      // Handle timeout
      client.on('timeout', () => {
        console.log(`⏰ Connection timeout: ${serverConfig.ip}:${serverConfig.port}`);
        client.destroy();
      });

      // Store the connection
      this.connections.set(serverId, client);

    } catch (error) {
      console.error(`🚨 Failed to create connection to ${serverConfig.ip}:${serverConfig.port}:`, error);
    }
  }

  disconnectFromServer(serverId: string) {
    const client = this.connections.get(serverId);
    if (client && !client.destroyed) {
      console.log(`🔌 Disconnecting from ${serverId}`);
      client.destroy();
    }
    this.cleanup(serverId);
    this.connections.delete(serverId);
  }

  disconnectAll() {
    console.log(`🛑 Disconnecting all connections`);
    this.connections.forEach((client, serverId) => {
      if (!client.destroyed) {
        client.destroy();
      }
      this.cleanup(serverId);
    });
    this.connections.clear();
  }

  private cleanup(serverId: string) {
    const interval = this.intervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(serverId);
      console.log(`🧹 Cleaned up interval for ${serverId}`);
    }
  }

  getConnectionStatus(): { serverId: string; connected: boolean }[] {
    const status: { serverId: string; connected: boolean }[] = [];
    this.connections.forEach((client, serverId) => {
      status.push({
        serverId,
        connected: client && !client.destroyed && client.readyState === 'open'
      });
    });
    return status;
  }

  // Send custom packet to specific server
  sendCustomPacket(serverId: string, packet: string) {
    const client = this.connections.get(serverId);
    if (client && !client.destroyed) {
      client.write(packet);
      console.log(`📤 Custom packet sent to ${serverId}: ${packet}`);
      return true;
    }
    console.log(`❌ Cannot send packet - no connection to ${serverId}`);
    return false;
  }
}

// HTTP-based alternative
class HTTPConnectionManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  async connectToServer(serverConfig: { ip: string; port: number; id: string }, deviceConfig: any) {
    const serverId = serverConfig.id;
    const baseUrl = `http://${serverConfig.ip}:${serverConfig.port}`;
    
    console.log(`🔄 HTTP connecting to ${baseUrl}`);

    try {
      // Send login packet
      const loginPacket = buildLoginPacket(deviceConfig);
      const loginResponse = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: loginPacket,
      });

      console.log(`📤 Login sent via HTTP to ${baseUrl}`);
      console.log(`📦 Login Packet: ${loginPacket}`);
      console.log(`📥 Login Response: ${await loginResponse.text()}`);

      // Send PVT packets every 5 seconds
      const interval = setInterval(async () => {
        try {
          const pvtPacket = buildPvtPacket(deviceConfig);
          const pvtResponse = await fetch(`${baseUrl}/pvt`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: pvtPacket,
          });

          console.log(`📤 PVT sent via HTTP to ${baseUrl}`);
          console.log(`📦 PVT Packet: ${pvtPacket}`);
          console.log(`📥 PVT Response: ${await pvtResponse.text()}`);
        } catch (error) {
          console.error(`🚨 PVT Error:`, error);
        }
      }, 5000);

      this.intervals.set(serverId, interval);

    } catch (error) {
      console.error(`🚨 HTTP Connection Error:`, error);
    }
  }

  disconnectFromServer(serverId: string) {
    const interval = this.intervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(serverId);
      console.log(`🧹 Cleaned up HTTP interval for ${serverId}`);
    }
  }

  disconnectAll() {
    console.log(`🛑 Disconnecting all HTTP connections`);
    this.intervals.forEach((_, serverId) => {
      this.disconnectFromServer(serverId);
    });
  }
}

// Main Device Configuration Screen
const DeviceConfigPage: React.FC = () => {
  const [config, setConfig] = useState<DeviceConfig>({
    backend: '',
    ipPortPairs: [{ id: '1', ip: '', port: '' }],
    deviceImei: '',
    vendorId: '',
    vehicleNumber: '',
    networkProvider: '',
    firmwareVersion: '',
    useGpsCoordinates: true,
    latitude: '',
    longitude: '',
  });

  const [tcpManager] = useState(() => new TCPConnectionManager()); // Real TCP Manager
  const [httpManager] = useState(() => new HTTPConnectionManager()); // HTTP Manager
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ serverId: string; connected: boolean }[]>([]);

  const addIpPortPair = useCallback(() => {
    const newPair: IpPortPair = {
      id: Date.now().toString(),
      ip: '',
      port: '',
    };
    setConfig((prev) => ({
      ...prev,
      ipPortPairs: [...prev.ipPortPairs, newPair],
    }));
  }, []);

  const removeIpPortPair = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      ipPortPairs: prev.ipPortPairs.filter((pair) => pair.id !== id),
    }));
  }, []);

  // Make sure updateIpPortPair function is correct
  const updateIpPortPair = useCallback((id: string, field: 'ip' | 'port', value: string) => {
    setConfig((prev) => ({
      ...prev,
      ipPortPairs: prev.ipPortPairs.map((pair) =>
        pair.id === id ? { ...pair, [field]: value } : pair
      ),
    }));
  }, []);

  const updateConfig = useCallback(<K extends keyof DeviceConfig>(
    field: K,
    value: DeviceConfig[K]
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  // Fix the validateForm function to return boolean properly
  const validateForm = useCallback((): boolean => {
    if (!config.backend) {
      Alert.alert('Validation Error', 'Please select a backend');
      console.log('Validation Error', 'Please select a backend');
      return false;
    }
    
    const emptyPairs = config.ipPortPairs.filter(pair => !pair.ip.trim() || !pair.port.trim());
    if (emptyPairs.length > 0) {
      Alert.alert('Validation Error', 'Please fill all IP and Port fields');
      console.log('Validation Error', 'Please fill all IP and Port fields');
      return false;
    }

    if (!config.deviceImei.trim()) {
      Alert.alert('Validation Error', 'Please enter device IMEI');
      console.log('Validation Error', 'Please enter device IMEI');
      return false;
    }

    if (config.deviceImei.length !== 15) {
      Alert.alert('Validation Error', 'IMEI must be 15 digits');
      console.log('Validation Error', 'IMEI must be 15 digits');
      return false;
    }

    if (!config.vendorId.trim()) {
      Alert.alert('Validation Error', 'Please enter vendor ID');
      console.log('Validation Error', 'Please enter vendor ID');
      return false;
    }

    if (!config.vehicleNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter vehicle number');
      console.log('Validation Error', 'Please enter vehicle number');
      return false;
    }

    if (!config.networkProvider) {
      Alert.alert('Validation Error', 'Please select network provider');
      console.log('Validation Error', 'Please select network provider');
      return false;
    }

    if (!config.useGpsCoordinates) {
      if (!config.latitude.trim() || !config.longitude.trim()) {
        Alert.alert('Validation Error', 'Please enter latitude and longitude coordinates');
        console.log('Validation Error', 'Please enter latitude and longitude coordinates');
        return false;
      }
    }

    return true;
  }, [config]);

  // Fixed handleStartTransmission function
  const handleStartTransmission = useCallback(() => {
    console.log('🚀 Starting REAL TCP transmission');
    
    const isValid = validateForm();
    if (!isValid) {
      console.log('❌ Form validation failed');
      return;
    }

    try {
      setIsTransmitting(true);

      // Prepare device config
      const deviceConfig = {
        vendorId: config.vendorId?.trim() || 'DEFAULT_VENDOR',
        firmwareVersion: config.firmwareVersion?.trim() || 'FIRMWAREVER1.0',
        deviceImei: config.deviceImei?.trim() || '',
        vehicleNumber: config.vehicleNumber?.trim() || '',
        networkProvider: config.networkProvider || 'AIRTEL',
        latitude: config.useGpsCoordinates ? '30.101455' : (config.latitude?.trim() || '0.0'),
        longitude: config.useGpsCoordinates ? '78.289948' : (config.longitude?.trim() || '0.0')
      };

      console.log('🚀 Starting REAL TCP connections...');
      console.log('📋 Device Config:', JSON.stringify(deviceConfig, null, 2));

      // Get valid server pairs
      const validPairs = config.ipPortPairs.filter(pair => 
        pair.ip?.trim() && pair.port?.trim()
      );

      if (validPairs.length === 0) {
        Alert.alert('Error', 'No valid IP/Port pairs found');
        setIsTransmitting(false);
        return;
      }

      // Connect to all servers
      validPairs.forEach((pair, index) => {
        const serverConfig = {
          ip: pair.ip.trim(),
          port: parseInt(pair.port.trim(), 10),
          id: `server_${index + 1}`
        };
        
        console.log(`🔗 Connecting to REAL server ${index + 1}:`, serverConfig);
        tcpManager.connectToServer(serverConfig, deviceConfig);
      });

      // Update connection status every 2 seconds
      const statusInterval = setInterval(() => {
        const status = tcpManager.getConnectionStatus();
        setConnectionStatus(status);
        console.log('📊 Connection Status Update:', status);
      }, 2000);

      // Clear status interval when stopping transmission
      setTimeout(() => clearInterval(statusInterval), 300000); // 5 minutes max

      Alert.alert(
        '🌐 Real TCP Transmission Started',
        `📡 Connecting to ${validPairs.length} server(s)\n\n🔍 Check console for live data`,
        [
          {
            text: 'View Status',
            onPress: () => {
              const status = tcpManager.getConnectionStatus();
              console.log('📊 Current Status:', status);
              Alert.alert(
                'Connection Status',
                status.map(s => `${s.serverId}: ${s.connected ? '✅ Connected' : '❌ Disconnected'}`).join('\n')
              );
            }
          },
          { text: 'OK' }
        ]
      );

    } catch (error) {
      console.error('🚨 Error in real TCP transmission:', error);
      setIsTransmitting(false);
      Alert.alert('Error', `Failed to start TCP transmission: ${error}`);
    }
  }, [config, tcpManager, validateForm]);

  // Fixed handleStopTransmission function
  const handleStopTransmission = useCallback(() => {
    console.log('🛑 Stop transmission clicked');
    
    try {
      console.log('🛑 Stopping all transmissions...');
      tcpManager.disconnectAll();
      setIsTransmitting(false);
      
      Alert.alert('Transmission Stopped', '📡 All connections closed');
      console.log('✅ All transmissions stopped');
    } catch (error) {
      console.error('🚨 Error stopping transmission:', error);
      Alert.alert('Error', `Failed to stop transmission: ${error}`);
    }
  }, [tcpManager]);

  // Fixed handleSave function
  const handleSave = useCallback(() => {
    console.log('💾 Save button clicked');
    
    if (!validateForm()) {
      console.log('❌ Save validation failed');
      return;
    }

    try {
      // Generate packets for preview
      const pvtInputData = {
        vendorId: config.vendorId?.trim() || 'DEFAULT_VENDOR',
        firmwareVersion: config.firmwareVersion?.trim() || 'FIRMWAREVER1.0',
        deviceImei: config.deviceImei?.trim() || '',
        vehicleNumber: config.vehicleNumber?.trim() || '',
        networkProvider: config.networkProvider || 'AIRTEL',
        latitude: config.useGpsCoordinates ? '30.101455' : (config.latitude?.trim() || '0.0'),
        longitude: config.useGpsCoordinates ? '78.289948' : (config.longitude?.trim() || '0.0')
      };

      const loginPacket = buildLoginPacket(pvtInputData);
      const pvtPacket = buildPvtPacket(pvtInputData);

      console.log('='.repeat(60));
      console.log('🔐 GENERATED LOGIN PACKET:');
      console.log(loginPacket);
      console.log('='.repeat(60));
      console.log('📡 GENERATED PVT PACKET:');
      console.log(pvtPacket);
      console.log('='.repeat(60));
      
      Alert.alert(
        'Configuration Saved',
        '✅ Ready for transmission!\n\n📦 Packets generated successfully',
        [
          { 
            text: 'Start Transmission', 
            onPress: () => {
              console.log('🚀 Starting transmission from save dialog');
              handleStartTransmission();
            }
          },
          { text: 'OK', style: 'cancel' }
        ]
      );

    } catch (error) {
      console.error('🚨 Error in handleSave:', error);
      Alert.alert('Error', `Failed to save configuration: ${error}`);
    }
  }, [config, handleStartTransmission, validateForm]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset Configuration',
      'Are you sure you want to reset all fields?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setConfig({
              backend: '',
              ipPortPairs: [{ id: '1', ip: '', port: '' }],
              deviceImei: '',
              vendorId: '',
              vehicleNumber: '',
              networkProvider: '',
              firmwareVersion: '',
              useGpsCoordinates: true,
              latitude: '',
              longitude: '',
            });
          }
        }
      ]
    );
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1976D2" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon name="settings" size={28} color="#fff" />
          <Text style={styles.headerTitle}>Device Setup</Text>
        </View>
        <TouchableOpacity 
          style={styles.resetButton} 
          onPress={handleReset}
          activeOpacity={0.8}
        >
          <Icon name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Backend Selection */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="cloud" size={22} color="#1976D2" />
            <Text style={styles.cardTitle}>Backend Configuration</Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Select Backend *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={config.backend}
                onValueChange={(value: string) => updateConfig('backend', value)}
                style={styles.picker}
                dropdownIconColor="#666"
              >
                <Picker.Item label="Choose backend server..." value="" />
                <Picker.Item label="Production Server" value="production" />
                <Picker.Item label="Staging Server" value="staging" />
                <Picker.Item label="Development Server" value="development" />
                <Picker.Item label="Testing Server" value="testing" />
              </Picker>
            </View>
          </View>
        </View>

        {/* IP/Port Configuration */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeader}>
              <Icon name="router" size={22} color="#1976D2" />
              <Text style={styles.cardTitle}>Server Configuration</Text>
            </View>
            <TouchableOpacity 
              style={styles.addButton} 
              onPress={addIpPortPair}
              activeOpacity={0.8}
            >
              <Icon name="add-circle" size={20} color="#4CAF50" />
              <Text style={styles.addButtonText}>Add Server</Text>
            </TouchableOpacity>
          </View>

          {config.ipPortPairs.map((pair, index) => (
            <IpPortPairComponent
              key={pair.id}
              pair={pair}
              index={index}
              onIpChange={(id: string, value: string) => updateIpPortPair(id, 'ip', value)} // Fixed
              onPortChange={(id: string, value: string) => updateIpPortPair(id, 'port', value)} // Fixed
              onRemove={removeIpPortPair}
              canRemove={config.ipPortPairs.length > 1}
            />
          ))}
        </View>

        {/* Device Information */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="smartphone" size={22} color="#1976D2" />
            <Text style={styles.cardTitle}>Device Information</Text>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Device IMEI *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 15-digit IMEI number"
              value={config.deviceImei}
              onChangeText={(value) => updateConfig('deviceImei', value.replace(/\D/g, ''))}
              placeholderTextColor="#999"
              keyboardType="numeric"
              maxLength={15}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vendor ID *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter vendor identification"
              value={config.vendorId}
              onChangeText={(value) => updateConfig('vendorId', value)}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vehicle Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., MH-12-AB-1234"
              value={config.vehicleNumber}
              onChangeText={(value) => updateConfig('vehicleNumber', value.toUpperCase())}
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Network Provider *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={config.networkProvider}
                onValueChange={(value: 'Airtel' | 'Vodafone' | 'BSNL' | '') => 
                  updateConfig('networkProvider', value)
                }
                style={styles.picker}
                dropdownIconColor="#666"
              >
                <Picker.Item label="Select network provider..." value="" />
                <Picker.Item label="Airtel" value="Airtel" />
                <Picker.Item label="Vodafone" value="Vodafone" />
                <Picker.Item label="BSNL" value="BSNL" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Firmware Version</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., v2.1.3"
              value={config.firmwareVersion}
              onChangeText={(value) => updateConfig('firmwareVersion', value)}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* GPS Configuration */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="location-on" size={22} color="#1976D2" />
            <Text style={styles.cardTitle}>GPS Configuration</Text>
          </View>
          
          <View style={styles.switchContainer}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Use GPS coordinates from this device</Text>
              <Text style={styles.switchDescription}>
                {config.useGpsCoordinates 
                  ? 'Device will automatically get coordinates from GPS' 
                  : 'You need to manually enter coordinates'
                }
              </Text>
            </View>
            <Switch
              value={config.useGpsCoordinates}
              onValueChange={(value) => updateConfig('useGpsCoordinates', value)}
              trackColor={{ false: '#E0E0E0', true: '#1976D2' }}
              thumbColor={config.useGpsCoordinates ? '#fff' : '#f4f3f4'}
              ios_backgroundColor="#E0E0E0"
            />
          </View>

          {!config.useGpsCoordinates && (
            <View style={styles.coordinatesSection}>
              <View style={styles.coordinatesRow}>
                <View style={styles.coordinateField}>
                  <Text style={styles.label}>Latitude *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="19.0760"
                    value={config.latitude}
                    onChangeText={(value) => updateConfig('latitude', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.coordinateField}>
                  <Text style={styles.label}>Longitude *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="72.8777"
                    value={config.longitude}
                    onChangeText={(value) => updateConfig('longitude', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
              <Text style={styles.coordinateHint}>
                💡 Enter coordinates in decimal degrees format
              </Text>
            </View>
          )}
        </View>

        {/* Connection Status */}
        {isTransmitting && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusTitle}>🌐 Live Connection Status:</Text>
            {connectionStatus.map(status => (
              <Text key={status.serverId} style={styles.statusText}>
                {status.serverId}: {status.connected ? '✅ Connected' : '❌ Disconnected'}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.saveButton]} 
          onPress={handleSave}
          activeOpacity={0.9}
        >
          <Icon name="save" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>Save Config</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.actionButton, 
            isTransmitting ? styles.stopButton : styles.transmitButton
          ]} 
          onPress={isTransmitting ? handleStopTransmission : handleStartTransmission}
          activeOpacity={0.9}
        >
          <Icon 
            name={isTransmitting ? "stop" : "send"} 
            size={20} 
            color="#fff" 
          />
          <Text style={styles.transmitButtonText}>
            {isTransmitting ? "Stop" : "Start"} Transmission
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Styles for IpPortPair component
const ipPortStyles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  removeButton: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#FFF5F5',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6C757D',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#495057',
  },
});

// Main styles
interface Styles {
  safeArea: ViewStyle;
  header: ViewStyle;
  headerLeft: ViewStyle;
  headerTitle: TextStyle;
  resetButton: ViewStyle;
  scrollView: ViewStyle;
  scrollContent: ViewStyle;
  card: ViewStyle;
  cardHeader: ViewStyle;
  cardHeaderRow: ViewStyle;
  cardTitle: TextStyle;
  inputGroup: ViewStyle;
  label: TextStyle;
  input: ViewStyle & TextStyle;
  pickerWrapper: ViewStyle;
  picker: ViewStyle;
  switchContainer: ViewStyle;
  switchInfo: ViewStyle;
  switchLabel: TextStyle;
  switchDescription: TextStyle;
  coordinatesSection: ViewStyle;
  coordinatesRow: ViewStyle;
  coordinateField: ViewStyle;
  coordinateHint: TextStyle;
  addButton: ViewStyle;
  addButtonText: TextStyle;
  bottomBar: ViewStyle;
  saveButton: ViewStyle;
  saveButtonText: TextStyle;
  actionButton: ViewStyle;
  transmitButton: ViewStyle;
  stopButton: ViewStyle;
  transmitButtonText: TextStyle;
  statusContainer: ViewStyle;
  statusTitle: TextStyle;
  statusText: TextStyle;
}

const styles = StyleSheet.create<Styles>({
  safeArea: {
    flex: 1,
    backgroundColor: '#1976D2',
  },
  header: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 12,
  },
  resetButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginLeft: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#FAFBFC',
    color: '#495057',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 12,
    backgroundColor: '#FAFBFC',
    overflow: 'hidden',
  },
  picker: {
    height: 52,
    color: '#495057',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 13,
    color: '#6C757D',
    lineHeight: 18,
  },
  coordinatesSection: {
    marginTop: 16,
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 16,
  },
  coordinateField: {
    flex: 1,
  },
  coordinateHint: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 12,
    fontStyle: 'italic',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  addButtonText: {
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 14,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginHorizontal: 4,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  transmitButton: {
    backgroundColor: '#FF9800',
    flex: 2,
  },
  stopButton: {
    backgroundColor: '#F44336',
    flex: 2,
  },
  transmitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusContainer: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#28A745',
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 4,
  },
});

export default DeviceConfigPage;