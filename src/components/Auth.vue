<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWordStore } from '@/stores/wordStore';
import { Loader2, Activity } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = useWordStore();
const username = ref('');
const password = ref('');
const isLoading = ref(false);
const error = ref('');

// Parse initial URL
const parseUrl = (url: string) => {
  try {
    const u = new URL(url);
    return {
      host: `${u.protocol}//${u.hostname}`,
      port: u.port || (u.protocol === 'https:' ? '443' : '80')
    };
  } catch (e) {
    return { host: 'http://localhost', port: '6900' };
  }
};

const { host, port } = parseUrl(store.apiUrl);
const serverHost = ref(host);
// If port is 3000 (old default), switch to 6900
const serverPort = ref((port === '3000' || !port) ? '6900' : port);

const updateServerUrl = () => {
  let host = serverHost.value.replace(/\/$/, '');
  if (!/^https?:\/\//.test(host)) {
    host = 'http://' + host;
  }
  store.setApiUrl(`${host}:${serverPort.value}`);
};

const isPinging = ref(false);
const pingMessage = ref('');

const handlePing = async () => {
  isPinging.value = true;
  pingMessage.value = 'Pinging...';
  
  try {
    const result = await store.pingServer();
    pingMessage.value = result.success ? 'Pong!' : 'Failed';
    
    // Reset message after 2 seconds
    setTimeout(() => {
      pingMessage.value = '';
    }, 2000);
  } catch (e) {
    pingMessage.value = 'Error';
  } finally {
    isPinging.value = false;
  }
};

const handleLogin = async () => {
  if (!username.value || !password.value) return;
  
  isLoading.value = true;
  error.value = '';
  
  try {
    const result = await store.login(username.value, password.value);
    if (result.success) {
      emit('close');
    } else {
      error.value = result.error || 'Invalid credentials';
    }
  } catch (e) {
    error.value = 'Login failed: ' + (e instanceof Error ? e.message : String(e));
  } finally {
    isLoading.value = false;
  }
};

const handleRegister = async () => {
  if (!username.value || !password.value) return;
  
  isLoading.value = true;
  error.value = '';
  
  try {
    const result = await store.register(username.value, password.value);
    if (result.success) {
      emit('close');
    } else {
      error.value = result.error || 'Registration failed (username might be taken)';
    }
  } catch (e) {
    error.value = 'Registration failed: ' + (e instanceof Error ? e.message : String(e));
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
    <Card class="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle>Sync Account</CardTitle>
        <CardDescription>
          Log in or create an account to sync your words across devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs default-value="login" class="w-full">
          <TabsList class="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-sm font-medium">Username</label>
                <Input v-model="username" placeholder="Enter your username" @keyup.enter="handleLogin" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Password</label>
                <Input v-model="password" type="password" placeholder="Enter your password" @keyup.enter="handleLogin" />
              </div>
              <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
              <Button class="w-full" @click="handleLogin" :disabled="isLoading">
                <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
                {{ isLoading ? 'Logging in...' : 'Login' }}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="register">
            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-sm font-medium">Username</label>
                <Input v-model="username" placeholder="Choose a username" @keyup.enter="handleRegister" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Password</label>
                <Input v-model="password" type="password" placeholder="Choose a password" @keyup.enter="handleRegister" />
              </div>
              <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
              <Button class="w-full" @click="handleRegister" :disabled="isLoading">
                <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
                {{ isLoading ? 'Create Account' : 'Create Account' }}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div class="mt-6 pt-4 border-t">
          <div class="grid grid-cols-3 gap-2">
            <div class="col-span-2 space-y-1">
              <label class="text-xs font-medium text-muted-foreground">Server Host</label>
              <Input v-model="serverHost" placeholder="http://localhost" class="h-8 text-xs" @change="updateServerUrl" />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-medium text-muted-foreground">Port</label>
              <Input v-model="serverPort" placeholder="6900" class="h-8 text-xs" @change="updateServerUrl" />
            </div>
          </div>
          <div class="mt-2">
            <Button variant="outline" size="sm" class="w-full h-8 text-xs" @click="handlePing" :disabled="isPinging">
              <Activity v-if="isPinging" class="mr-2 h-3 w-3 animate-spin" />
              <Activity v-else class="mr-2 h-3 w-3" />
              {{ pingMessage || 'Ping Server' }}
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" class="w-full" @click="$emit('close')">
          Cancel
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
