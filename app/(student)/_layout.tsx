import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function StudentLayout() {
  const { user, profile, studentProfile } = useAuthStore();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  if (profile?.role !== 'student') {
    return <Redirect href="/" />;
  }
  if (!studentProfile?.student_id_url || !studentProfile?.acceptance_letter_url) {
    return <Redirect href="/(auth)/student-documents" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: { backgroundColor: Colors.card },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={typeof color === 'string' ? color : undefined} />
          ),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={22} color={typeof color === 'string' ? color : undefined} />
          ),
        }}
      />
      <Tabs.Screen
        name="ride-status"
        options={{
          title: 'My Ride',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'car' : 'car-outline'} size={22} color={typeof color === 'string' ? color : undefined} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={typeof color === 'string' ? color : undefined} />
          ),
        }}
      />
    </Tabs>
  );
}
