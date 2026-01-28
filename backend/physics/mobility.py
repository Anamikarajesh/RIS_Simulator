"""
Mobility Models for RIS Simulator
Implements: Static, Random Waypoint, Gaussian Markov
"""
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class NodeState:
    """State of a mobile node"""
    position: np.ndarray  # [x, y, z]
    velocity: np.ndarray  # [vx, vy, vz]
    destination: np.ndarray = None
    
class MobilityModel:
    """Base class for mobility models"""
    
    def __init__(self, bounds: Tuple[float, float, float, float], height: float = 1.5):
        """
        bounds: (x_min, x_max, z_min, z_max)
        height: fixed y-coordinate for ground-level nodes
        """
        self.bounds = bounds
        self.height = height
        
    def update(self, state: NodeState, dt: float) -> NodeState:
        """Update node position. Override in subclasses."""
        raise NotImplementedError


class StaticMobility(MobilityModel):
    """No movement"""
    def update(self, state: NodeState, dt: float) -> NodeState:
        return state


class RandomWaypointMobility(MobilityModel):
    """
    Random Waypoint Mobility Model:
    1. Choose random destination
    2. Move towards it at random speed
    3. Pause briefly at destination
    4. Repeat
    """
    
    def __init__(self, bounds, height=1.5, v_min=0.5, v_max=3.0, pause_time=1.0):
        super().__init__(bounds, height)
        self.v_min = v_min  # m/s (walking speed)
        self.v_max = v_max  # m/s
        self.pause_time = pause_time
        self.pause_remaining = {}
        
    def _random_destination(self) -> np.ndarray:
        x = np.random.uniform(self.bounds[0], self.bounds[1])
        z = np.random.uniform(self.bounds[2], self.bounds[3])
        return np.array([x, self.height, z])
    
    def update(self, state: NodeState, dt: float) -> NodeState:
        pos = state.position.copy()
        
        # Check if we need a new destination
        if state.destination is None:
            state.destination = self._random_destination()
            speed = np.random.uniform(self.v_min, self.v_max)
            direction = state.destination - pos
            dist = np.linalg.norm(direction)
            if dist > 0:
                state.velocity = (direction / dist) * speed
            else:
                state.velocity = np.zeros(3)
        
        # Move towards destination
        direction = state.destination - pos
        dist_to_dest = np.linalg.norm(direction)
        move_dist = np.linalg.norm(state.velocity) * dt
        
        if move_dist >= dist_to_dest:
            # Arrived at destination
            pos = state.destination.copy()
            state.destination = None  # Will pick new destination next update
            state.velocity = np.zeros(3)
        else:
            # Continue moving
            pos = pos + state.velocity * dt
        
        state.position = pos
        return state


class GaussianMarkovMobility(MobilityModel):
    """
    Gaussian-Markov Mobility Model:
    Velocity updated with memory (alpha) and random Gaussian component.
    v(t+1) = alpha * v(t) + (1-alpha) * v_mean + sigma * sqrt(1-alpha^2) * N(0,1)
    """
    
    def __init__(self, bounds, height=1.5, alpha=0.75, v_mean=1.0, sigma=0.5):
        super().__init__(bounds, height)
        self.alpha = alpha  # Memory factor (0-1)
        self.v_mean = v_mean  # Mean velocity magnitude
        self.sigma = sigma  # Velocity standard deviation
        
    def update(self, state: NodeState, dt: float) -> NodeState:
        pos = state.position.copy()
        vel = state.velocity.copy()
        
        # Update velocity with Gaussian-Markov process (for x and z components)
        for i in [0, 2]:  # x and z only
            noise = np.random.normal(0, 1)
            vel[i] = (self.alpha * vel[i] + 
                     (1 - self.alpha) * self.v_mean * np.sign(vel[i] + 0.01) +
                     self.sigma * np.sqrt(1 - self.alpha**2) * noise)
        vel[1] = 0  # Keep y-velocity zero (ground level)
        
        # Update position
        new_pos = pos + vel * dt
        
        # Reflect at boundaries
        if new_pos[0] < self.bounds[0] or new_pos[0] > self.bounds[1]:
            vel[0] = -vel[0]
            new_pos[0] = np.clip(new_pos[0], self.bounds[0], self.bounds[1])
        if new_pos[2] < self.bounds[2] or new_pos[2] > self.bounds[3]:
            vel[2] = -vel[2]
            new_pos[2] = np.clip(new_pos[2], self.bounds[2], self.bounds[3])
        
        # Keep at fixed height
        new_pos[1] = self.height
        
        state.position = new_pos
        state.velocity = vel
        return state


class MobilityManager:
    """Manages mobility for multiple nodes"""
    
    def __init__(self, model_type: str, bounds: Tuple[float, float, float, float]):
        self.bounds = bounds
        self.model_type = model_type
        self.model = self._create_model(model_type)
        self.node_states = {}
        
    def _create_model(self, model_type: str) -> MobilityModel:
        if model_type == 'static':
            return StaticMobility(self.bounds)
        elif model_type == 'random_waypoint':
            return RandomWaypointMobility(self.bounds)
        elif model_type == 'gaussian':
            return GaussianMarkovMobility(self.bounds)
        else:
            return StaticMobility(self.bounds)
    
    def initialize_node(self, node_id: str, position: List[float]):
        self.node_states[node_id] = NodeState(
            position=np.array(position),
            velocity=np.zeros(3),
            destination=None
        )
    
    def update_all(self, dt: float) -> dict:
        """Update all nodes and return new positions"""
        new_positions = {}
        for node_id, state in self.node_states.items():
            updated_state = self.model.update(state, dt)
            self.node_states[node_id] = updated_state
            new_positions[node_id] = updated_state.position.tolist()
        return new_positions
